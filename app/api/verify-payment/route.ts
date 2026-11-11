import { NextRequest, NextResponse } from 'next/server';
import { getSiteUrl } from '@/lib/siteUrl';
import connectDB from '@/lib/mongodb';
import Order from '@/lib/models/Order';
import CustomOrder from '@/lib/models/CustomOrder';
import UnifiedOrder from '@/lib/models/UnifiedOrder';
import Invoice from '@/lib/models/Invoice';
import { sendInvoiceEmail } from '@/lib/email';



export async function GET(request: NextRequest) {
  try {
    console.log('\n========== PAYMENT VERIFICATION START ==========');
    const reference = request.nextUrl.searchParams.get('reference');
    const queryEmail = request.nextUrl.searchParams.get('email') || '';
    const queryName = request.nextUrl.searchParams.get('name') || '';
    
    if (!reference) {
      console.error("❌ [verify-payment] No reference provided");
      return NextResponse.json({ error: 'No reference provided' }, { status: 400 });
    }

    console.log("[verify-payment] 📋 Reference:", reference);
    console.log("[verify-payment] 🔍 Verifying payment for reference:", reference);

    // Verify with Flutterwave API
    const secretKey = process.env.FLUTTERWAVE_SECRET_KEY;

    if (!secretKey) {
      console.error("❌ [verify-payment] FLUTTERWAVE_SECRET_KEY not configured");
      return NextResponse.json({ error: 'Payment verification service not configured' }, { status: 500 });
    }

    const transactionId = request.nextUrl.searchParams.get('transaction_id');
    
    let verifyUrl = "";
    if (transactionId) {
      verifyUrl = `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`;
    } else {
      verifyUrl = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${reference}`;
    }
    
    console.log("[verify-payment] 🔑 Secret key found:", !!secretKey);
    console.log("[verify-payment] 📡 Making request to Flutterwave API:", verifyUrl);

    const response = await fetch(verifyUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log("[verify-payment] ✅ Got response from Flutterwave");
    console.log("[verify-payment] 📊 Response status:", response.status);
    console.log("[verify-payment] 📋 Response data:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.error("❌ [verify-payment] Flutterwave API error:", data);
      return NextResponse.json(
        { error: data.message || 'Payment verification failed' },
        { status: response.status }
      );
    }

    // Check if payment was successful
    console.log("[verify-payment] 🔎 Checking payment status...");
    console.log("[verify-payment] Payment status from Flutterwave:", data.data?.status);
    
    const isSuccess = data.status === 'success' && (data.data?.status === 'successful' || data.data?.status === 'completed');

    if (isSuccess) {
      console.log("[verify-payment] ✅✅✅ PAYMENT VERIFIED AS SUCCESSFUL!");
      console.log("[verify-payment] 🎯 STARTING INVOICE CREATION PROCESS");
      
      // Extract payment data from Flutterwave (Flutterwave amount is in base currency, e.g. Naira)
      const paymentAmount = Number(data.data.amount);
      const paymentReference = data.data.tx_ref;
      const paymentCustomer = {
        email: data.data.customer?.email || '',
        phone: data.data.customer?.phone_number || '',
        first_name: data.data.customer?.name?.split(' ')[0] || '',
        last_name: data.data.customer?.name?.split(' ').slice(1).join(' ') || '',
      } as any;
      
      // Use email from query params (passed from checkout) first, fall back to Paystack data
      // IMPORTANT: Lowercase email to match invoice query logic
      const customerEmail = (queryEmail || paymentCustomer.email || '').toLowerCase();
      const customerName = queryName || paymentCustomer.customer_code?.split('_')[0] || paymentCustomer.first_name || 'Customer';
      
      console.log('[verify-payment] 💳 Payment data extracted:');
      console.log('[verify-payment]   - Reference:', paymentReference);
      console.log('[verify-payment]   - Amount:', paymentAmount);
      console.log('[verify-payment]   - Customer Email:', customerEmail);
      console.log('[verify-payment]   - Customer Name:', customerName);
      console.log('[verify-payment]   - Email Source:', queryEmail ? 'Query Parameter ✅' : (paymentCustomer.email ? 'Paystack Data' : 'Empty ⚠️'));
      
      // Generate invoice immediately (will be linked to order when order is created)
      try {
        console.log('[verify-payment] 🗄️ Connecting to database...');
        await connectDB();
        console.log('[verify-payment] ✅ Database connected!');
        
        // Check if this is a custom order to get quote items
        let invoiceItems: any[] = [{
          name: 'Payment for Order',
          quantity: 1,
          price: paymentAmount,
          mode: 'buy',
        }];
        let invoiceSubtotal = paymentAmount;
        
        let customerAddress = '';
        let customerCity = '';
        let customerState = '';
        let customerPhone = paymentCustomer.phone || '';
        let customerName = queryName || paymentCustomer.customer_code?.split('_')[0] || paymentCustomer.first_name || 'Customer';
        let customerCountry = '';

        // Check UnifiedOrder first (unified source of truth)
        const unifiedOrder = await UnifiedOrder.findOne({
          $or: [
            { paymentReference: paymentReference },
            { orderNumber: paymentReference }
          ]
        });

        if (unifiedOrder) {
          console.log('[verify-payment] 🎯 Found unified order:', unifiedOrder.orderNumber);

          // Flutterwave confirmed this payment: mark the order paid if it covers the total
          // and the payment isn't already attached to another paid order
          if (!unifiedOrder.paymentVerified) {
            const reusedElsewhere = await UnifiedOrder.findOne({
              paymentReference,
              paymentVerified: true,
              _id: { $ne: unifiedOrder._id },
            }).select('_id').lean();
            if (!reusedElsewhere && paymentAmount + 1 >= (Number(unifiedOrder.total) || 0)) {
              unifiedOrder.paymentVerified = true;
              unifiedOrder.paymentVerifiedAt = new Date();
              if (!unifiedOrder.paymentReference) unifiedOrder.paymentReference = paymentReference;
              await unifiedOrder.save();
              console.log('[verify-payment] ✅ Order marked paid after Flutterwave confirmation');
            } else {
              console.warn('[verify-payment] ⚠️ Not marking order paid:', reusedElsewhere ? 'payment reused' : `paid ${paymentAmount} < total ${unifiedOrder.total}`);
            }
          }
          customerAddress = unifiedOrder.address || '';
          customerCity = unifiedOrder.city || '';
          customerState = unifiedOrder.state || '';
          if (unifiedOrder.phone) customerPhone = unifiedOrder.phone;
          if (unifiedOrder.country) customerCountry = unifiedOrder.country;
          if (unifiedOrder.firstName || unifiedOrder.lastName) {
            customerName = `${unifiedOrder.firstName} ${unifiedOrder.lastName}`.trim();
          }

          if (unifiedOrder.orderType === 'custom') {
            if (unifiedOrder.quoteItems && unifiedOrder.quoteItems.length > 0) {
              invoiceItems = unifiedOrder.quoteItems.map((item: any) => ({
                name: item.itemName,
                quantity: item.quantity,
                price: item.unitPrice,
                mode: 'buy',
              }));
              invoiceSubtotal = unifiedOrder.quoteItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
            }
          } else {
            if (unifiedOrder.items && unifiedOrder.items.length > 0) {
              invoiceItems = unifiedOrder.items.map((item: any) => ({
                name: item.name,
                quantity: item.quantity,
                price: item.unitPrice || item.price || 0,
                mode: item.mode || 'buy',
                rentalDays: item.rentalDays || 0,
                selectedSize: item.selectedSize,
                selectedColor: item.selectedColor,
              }));
              invoiceSubtotal = unifiedOrder.subtotal;
            }
          }
        } else {
          // Fallback to legacy models
          const customOrder = await CustomOrder.findOne({ orderNumber: paymentReference });
          if (customOrder) {
            console.log('[verify-payment] 🎯 Found legacy custom order:', customOrder.orderNumber);
            customerAddress = customOrder.address || '';
            customerCity = customOrder.city || '';
            customerState = customOrder.state || '';
            if (customOrder.phone) customerPhone = customOrder.phone;
            if (customOrder.fullName) customerName = customOrder.fullName;
            if ((customOrder as any).country) customerCountry = (customOrder as any).country;

            if (customOrder.quoteItems && customOrder.quoteItems.length > 0) {
              invoiceItems = customOrder.quoteItems.map((item: any) => ({
                name: item.itemName,
                quantity: item.quantity,
                price: item.unitPrice,
                mode: 'buy',
              }));
              invoiceSubtotal = customOrder.quoteItems.reduce((sum: number, item: any) => sum + (item.quantity * item.unitPrice), 0);
            }
          } else {
            const legacyOrder = await Order.findOne({ reference: paymentReference });
            if (legacyOrder) {
              console.log('[verify-payment] 🎯 Found legacy order:', legacyOrder.orderNumber);
              customerAddress = legacyOrder.address || '';
              customerCity = legacyOrder.city || '';
              customerState = legacyOrder.state || '';
              if (legacyOrder.phone) customerPhone = legacyOrder.phone;
              if ((legacyOrder as any).country) customerCountry = (legacyOrder as any).country;
              if (legacyOrder.firstName || legacyOrder.lastName) {
                customerName = `${legacyOrder.firstName} ${legacyOrder.lastName}`.trim();
              }
            }
          }
        }
        
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
        const invoiceDate = new Date();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        
        console.log('[verify-payment] 📄 Creating invoice:', invoiceNumber);
        console.log('[verify-payment] 📝 Invoice Details:');
        console.log('[verify-payment]   - orderNumber:', paymentReference);
        console.log('[verify-payment]   - customerEmail:', customerEmail);
        console.log('[verify-payment]   - paymentVerified: true');
        console.log('[verify-payment]   - type: automatic');
        
        // Create invoice with quote items if custom order
        const invoice = new Invoice({
          invoiceNumber,
          orderNumber: paymentReference,
          customerName: customerName,
          customerEmail: customerEmail,
          customerPhone: customerPhone || '',
          customerAddress: customerAddress ? (customerCountry && customerCountry.toLowerCase() !== 'nigeria' ? `${customerAddress}, ${customerCountry}` : customerAddress) : '',
          customerCity: customerCity || '',
          customerState: customerState || '',
          subtotal: invoiceSubtotal,
          shippingCost: 0,
          taxAmount: 0,
          totalAmount: paymentAmount,
          items: invoiceItems,
          invoiceDate,
          dueDate,
          currency: 'NGN',
          currencySymbol: '₦',
          taxRate: 7.5,
          type: 'automatic',
          status: 'sent',
          paymentVerified: true,
          paymentReference: paymentReference,
        });
        
        console.log('[verify-payment] 🔍 Invoice object BEFORE save:');
        console.log('[verify-payment]   - paymentVerified:', invoice.paymentVerified);
        console.log('[verify-payment]   - paymentReference:', invoice.paymentReference);
        console.log('[verify-payment]   - Type of paymentVerified:', typeof invoice.paymentVerified);
        
        await invoice.save();
        console.log('[verify-payment] 💾 Invoice.save() completed successfully');
        
        console.log('[verify-payment] 🔍 Invoice object AFTER save:');
        console.log('[verify-payment]   - paymentVerified:', invoice.paymentVerified);
        console.log('[verify-payment]   - paymentReference:', invoice.paymentReference);
        console.log('[verify-payment]   - Type of paymentVerified:', typeof invoice.paymentVerified);
        
        console.log('[verify-payment] ✅ Invoice created:', invoiceNumber);
        console.log('[verify-payment] 📊 Invoice saved to DB:');
        console.log('[verify-payment]   - invoiceNumber:', invoice.invoiceNumber);
        console.log('[verify-payment]   - _id:', invoice._id);
        console.log('[verify-payment]   - orderNumber:', invoice.orderNumber);
        console.log('[verify-payment]   - paymentVerified:', invoice.paymentVerified);
        console.log('[verify-payment]   - customerEmail:', invoice.customerEmail);
        console.log('[verify-payment] 📋 Invoice will appear in user dashboard Invoices tab');
        
        // Send invoice email to customer
        try {
          console.log(`[verify-payment] 📧 Sending invoice email to customer: ${customerEmail}`);
          
          // Generate invoice HTML for email
          const invoiceHtml = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
              <h2>Invoice ${invoiceNumber}</h2>
              <p><strong>Order Number:</strong> ${paymentReference}</p>
              <p><strong>Date:</strong> ${invoiceDate.toLocaleDateString()}</p>
              <hr/>
              <h3>Items</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Item</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Qty</th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Price</th>
                </tr>
                ${invoiceItems?.map((item: any) => `
                  <tr>
                    <td style="border: 1px solid #ddd; padding: 8px;">${item.name}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">${item.quantity}</td>
                    <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">₦${(item.price * item.quantity).toLocaleString()}</td>
                  </tr>
                `).join('') || ''}
              </table>
              <hr/>
              <div style="text-align: right; font-size: 14px;">
                <p><strong>Subtotal:</strong> ₦${invoiceSubtotal.toLocaleString()}</p>
                <p style="font-size: 16px;"><strong>Total: ₦${paymentAmount.toLocaleString()}</strong></p>
              </div>
            </div>
          `;
          
          const emailResult = await sendInvoiceEmail(
            customerEmail,
            customerName,
            invoiceNumber,
            invoiceHtml,
            paymentReference
          );
          
          console.log(`[verify-payment] 📧 Invoice email result - Customer: ${emailResult.customerSent ? '✅' : '❌'}, Admin: ${emailResult.adminSent ? '✅' : '❌'}`);
        } catch (emailError) {
          console.error('[verify-payment] Warning: Could not send invoice email', emailError);
        }
        
        // Send admin and buyer payment notification messages
        try {
          console.log('[verify-payment] 📨 Sending payment notification messages (admin + buyer)');
          const baseUrl = getSiteUrl();
          
          const notificationRes = await fetch(`${baseUrl}/api/send-payment-notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'success',
              orderNumber: paymentReference,
              buyerEmail: customerEmail,
              buyerName: customerName,
              amount: paymentAmount,
              paymentReference: paymentReference,
              invoiceId: invoice._id?.toString(),
              isCustomOrder: false,
            }),
          });

          if (!notificationRes.ok) {
            console.error('[verify-payment] ❌ Failed to send payment notification messages:', notificationRes.status);
            const errorText = await notificationRes.text();
            console.error('[verify-payment] Error response:', errorText);
          } else {
            const notificationData = await notificationRes.json();
            console.log('[verify-payment] ✅ Payment notification messages sent successfully');
            console.log('[verify-payment] 📧 Buyer message ID:', notificationData.buyerMessageId);
            console.log('[verify-payment] 🔔 Admin message ID:', notificationData.adminMessageId);
          }
        } catch (msgError) {
          console.error('[verify-payment] ❌ Error sending payment notification messages:', msgError);
        }
        
      } catch (invoiceError) {
        console.error('[verify-payment] ❌ Invoice/notification processing failed:', invoiceError);
        if (invoiceError instanceof Error) {
          console.error('[verify-payment] Error name:', invoiceError.name);
          console.error('[verify-payment] Error message:', invoiceError.message);
          console.error('[verify-payment] Error stack:', invoiceError.stack);
        }
      }
      
      console.log('[verify-payment] ✅✅✅ Sending SUCCESS response to frontend');
      const successResponse = {
        success: true,
        reference: data.data.tx_ref || data.data.reference,
        amount: data.data.amount,
        status: 'success', // Keep 'success' so the frontend verifyAndProcessPayment checks match
        customer: data.data.customer,
      };
      console.log('[verify-payment] Response:', JSON.stringify(successResponse, null, 2));
      console.log('========== PAYMENT VERIFICATION SUCCESS ==========\n');
      return NextResponse.json(successResponse);
    } else {
      console.log("⚠️ [verify-payment] Payment status is not success:", data.data?.status);
      console.log('========== PAYMENT VERIFICATION FAILED ==========\n');
      
      // Send failure notification
      try {
        await connectDB();
        const order = await Order.findOne({ orderNumber: reference });
        const customOrder = await CustomOrder.findOne({ orderNumber: reference });
        const orderData = order || customOrder;
        
        if (orderData) {
          console.log('[verify-payment] Found order for failed payment, but notifications disabled');
        }
      } catch (notificationError) {
        console.error('⚠️ Failed to process failed payment:', notificationError);
      }
      
      return NextResponse.json({
        success: false,
        status: data.data?.status,
        message: 'Payment not successful',
      });
    }
  } catch (error) {
    console.error("❌❌❌ [verify-payment] Exception in payment verification!");
    console.error("[verify-payment] Error:", error);
    console.log('========== PAYMENT VERIFICATION ERROR ==========\n');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Verification failed' },
      { status: 500 }
    );
  }
}
