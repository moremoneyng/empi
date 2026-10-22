"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { useCart } from "../components/CartContext";
import { useBuyer } from "../context/BuyerContext";
import { ShoppingBag, AlertCircle, CreditCard, Upload, Camera, CheckCircle2, Landmark, Truck } from "lucide-react";
import { getDiscountPercentage } from "@/lib/discountCalculator";
import { calculateVat, formatVatPercent } from "@/lib/vat";
import { useVatSettings } from "@/lib/hooks/useVatSettings";
import { usePaymentFee } from "@/lib/hooks/usePaymentFee";
import { validateCheckoutItemsModes } from "@/lib/utils/orderDiagnostics";


const SHIPPING_OPTIONS = {
  empi: { id: "empi", name: "EMPI Delivery", cost: 2500, estimatedDays: "2-5 business days" },
  self: { id: "self", name: "Self Pickup", cost: 0, estimatedDays: "Ready within 24 hours" },
};

export default function CheckoutPage() {
  const { items, clearCart, total, cautionFee, rentalSchedule } = useCart();
  const { buyer } = useBuyer();
  const router = useRouter();

  // CRITICAL: Log items from cart to see if they have mode
  if (items && items.length > 0) {
    console.log('[Checkout] 🛒 ITEMS FROM CART (START):');
    items.forEach((item: any, idx: number) => {
      console.log(`  [${idx + 1}] "${item.name}"`, {
        id: item.id,
        mode: item.mode || '❌ UNDEFINED',
        hasMode: !!item.mode,
        price: item.price,
        qty: item.quantity,
      });
    });
  }

  const [isHydrated, setIsHydrated] = useState(false);
  const { vatRate } = useVatSettings();
  const shippingOption = "empi"; // Fixed to EMPI Delivery only
  const [successReference, setSuccessReference] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [customQuote, setCustomQuote] = useState<any>(null);
  const [paymentSuccessful, setPaymentSuccessful] = useState(false);
  // CRITICAL: Prevent duplicate order creation from multiple payment callbacks
  const [paymentProcessed, setPaymentProcessed] = useState(false);
  const [guestCustomer, setGuestCustomer] = useState({
    fullName: '',
    email: '',
    phone: '',
    city: '',
    address: '',
    state: '',
    country: 'Nigeria',
  });

  // Pre-fill checkout form details from logged in buyer
  useEffect(() => {
    if (buyer) {
      setGuestCustomer(prev => ({
        ...prev,
        fullName: prev.fullName || buyer.fullName || '',
        email: prev.email || buyer.email || '',
        phone: prev.phone || buyer.phone || '',
        address: prev.address || buyer.address || '',
        city: prev.city || buyer.city || '',
        state: prev.state || buyer.state || '',
        country: prev.country || (buyer as any).country || 'Nigeria',
      }));
    }
  }, [buyer]);

  // Payment Method States
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'manual'>('paystack');
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string>('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [paymentVisibility, setPaymentVisibility] = useState({ manual: true, paystack: true });

  useEffect(() => {
    setIsHydrated(true);
    // Load custom order quote if coming from chat
    const savedQuote = sessionStorage.getItem('customOrderQuote');
    if (savedQuote) {
      try {
        const quote = JSON.parse(savedQuote);
        console.log('[Checkout] Loaded custom quote from sessionStorage:', quote);

        // Ensure all required quote fields have proper values
        const completeQuote = {
          orderId: quote.orderId,
          orderNumber: quote.orderNumber,
          quotedPrice: quote.quotedPrice || 0,
          quotedVAT: quote.quotedVAT || 0,
          quotedTotal: quote.quotedTotal || (quote.quotedPrice || 0) + (quote.quotedVAT || 0),
          quantity: quote.quantity || 1,
          vatPercent: typeof quote.vatPercent === 'number' ? quote.vatPercent : null,
          discountPercentage: quote.discountPercentage || 0,
          discountAmount: quote.discountAmount || 0,
        };

        console.log('[Checkout] Processed quote with values:', completeQuote);
        setCustomQuote(completeQuote);

        // Load customer info from the custom order if not logged in as a buyer
        if (quote.orderId && !buyer?.id) {
          console.log('[Checkout] Loading customer info from custom order:', quote.orderId);
          // Use unified endpoint
          fetch(`/api/orders/unified/${quote.orderId}`)
            .then(res => res.json())
            .then(customOrder => {
              if (customOrder && customOrder.firstName) {
                const fullName = `${customOrder.firstName} ${customOrder.lastName || ''}`.trim();
                setGuestCustomer({
                  fullName: fullName || '',
                  email: (customOrder.email || '').toLowerCase(),
                  phone: customOrder.phone || '',
                  city: customOrder.city || '',
                  address: customOrder.address || '',
                  state: customOrder.state || '',
                  country: customOrder.country || 'Nigeria',
                });

                // 🎁 ALSO LOAD DISCOUNT FROM DATABASE if it was persisted
                if (customOrder.discountPercentage !== undefined || customOrder.discountAmount !== undefined) {
                  console.log('[Checkout] 🎁 Loaded discount from database:', {
                    discountPercentage: customOrder.discountPercentage,
                    discountAmount: customOrder.discountAmount,
                  });

                  // Update the quote with database discount values
                  setCustomQuote((prev: any) => ({
                    ...prev,
                    discountPercentage: customOrder.discountPercentage || 0,
                    discountAmount: customOrder.discountAmount || 0,
                  }));
                }

                console.log('[Checkout] ✅ Loaded guest customer from unified order:', {
                  fullName: fullName,
                  email: customOrder.email,
                  phone: customOrder.phone,
                });
              }
            })
            .catch(err => console.error('[Checkout] Error loading custom order:', err));
        }
      } catch (err) {
        console.error('[Checkout] Error parsing quote:', err);
      }
    }

    // Fetch bank details and payment visibility settings
    fetch('/api/bank-details')
      .then(res => res.json())
      .then(data => {
        if (data.bank) {
          setBankDetails(data.bank);
        }
        if (data.paymentMethods) {
          setPaymentVisibility(data.paymentMethods);

          // Adjust default payment method if paystack is hidden
          if (data.paymentMethods.paystack === false && data.paymentMethods.manual === true) {
            setPaymentMethod('manual');
          }
        }
      })
      .catch(err => console.error('Error fetching bank details:', err));
  }, [buyer?.id]);

  // Handle URL redirect query parameters for Flutterwave redirect payments
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('reference') || params.get('tx_ref');
      const transactionId = params.get('transaction_id');
      const status = params.get('status');

      if (ref) {
        console.log(`Detected payment redirect: ref=${ref}, transactionId=${transactionId}, status=${status}`);
        setIsProcessing(true);
        if (status === 'failed') {
          setOrderError("Payment failed. Please try again.");
          setIsProcessing(false);
        } else {
          // Verify redirect payment
          verifyAndProcessPayment(ref, '', '', transactionId || undefined);
        }
      }
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setOrderError("Please upload an image file (JPG, PNG, etc.)");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setOrderError("Image size too large. Please use an image smaller than 5MB.");
      return;
    }

    setIsUploadingProof(true);
    setUploadProgress(10);
    setOrderError(null);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = reader.result as string;
        setUploadProgress(30);

        try {
          const res = await fetch('/api/cloudinary/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageData: base64Data,
              fileName: `proof-of-payment-${Date.now()}.jpg`
            }),
          });

          setUploadProgress(80);
          const data = await res.json();

          if (res.ok && data.url) {
            setPaymentProofUrl(data.url);
            setUploadProgress(100);
            console.log("✅ Proof of payment uploaded:", data.url);
          } else {
            setOrderError(data.error || "Failed to upload proof of payment");
          }
        } catch (err) {
          setOrderError("Error uploading proof of payment to server");
        } finally {
          setIsUploadingProof(false);
        }
      };
    } catch (err) {
      setOrderError("Error reading file");
      setIsUploadingProof(false);
    }
  };

  // Processing fee the customer paid on top of the order total, saved when the payment started
  const pendingPaymentFee = (reference: string): number => {
    try {
      const pending = JSON.parse(localStorage.getItem('empi_pending_payment') || 'null');
      return pending?.reference === reference ? Number(pending.paymentFee) || 0 : 0;
    } catch {
      return 0;
    }
  };

  // Handle payment success - save order (invoice auto-generated via API)
  const handlePaymentSuccess = async (response: any) => {
    console.log("✅ Payment success handler called");
    console.log("Reference:", response?.reference);

    // CRITICAL: Prevent duplicate order creation
    if (paymentProcessed) {
      console.log("⚠️ Payment already processed, ignoring duplicate call");
      return;
    }

    setPaymentProcessed(true);

    try {
      // Use the unified form state guestCustomer
      const customerInfo = guestCustomer;

      if (!customerInfo.fullName || !customerInfo.email || !customerInfo.phone || !customerInfo.address || !customerInfo.city || !customerInfo.state || !customerInfo.country) {
        setOrderError("Customer information is incomplete. Please fill in all required fields (Name, Email, Phone, Address, City, State, Country).");
        setIsProcessing(false);
        return;
      }

      let orderData;

      // Consolidated order data - treat all orders the same way
      // Shipping removed from checkout totals and order payloads
      const shippingCost = 0;
      // For regular cart orders, `total` is goods/services subtotal (buy + rental days)
      // Tax should be charged on goods/services only (NOT on caution fee)
      if (customQuote) {
        const subtotal = customQuote.quotedPrice || 0;
        const taxAmount = customQuote.quotedVAT || 0;
        const totalAmount = customQuote.quotedTotal || (subtotal + taxAmount + shippingCost);

        // For custom orders, update via unified endpoint
        // Status should REMAIN 'pending' - admin must explicitly approve
        try {
          const nameParts = (customerInfo.fullName || '').trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';

          const updateRes = await fetch(`/api/orders/unified/${customQuote.orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'pending', // Custom orders stay pending until admin approves
              paymentReference: response.reference,
              paymentVerified: true,
              firstName: firstName,
              lastName: lastName,
              email: customerInfo.email.toLowerCase(),
              phone: customerInfo.phone,
              address: customerInfo.address || '',
              city: customerInfo.city || '',
              state: customerInfo.state || '',
              country: customerInfo.country || 'Nigeria',
            }),
          });

          if (updateRes.ok) {
            const updateData = await updateRes.json();
            console.log("✅ Custom order payment verified, status remains 'pending':", updateData);
          } else {
            const errorData = await updateRes.json();
            console.error("❌ Failed to update custom order status:", errorData);
          }
        } catch (err) {
          console.error("Error updating custom order status:", err);
        }

        // Call verify-payment to trigger invoice generation for custom orders
        console.log("📧 Triggering invoice generation for custom order...");
        try {
          const params = new URLSearchParams();
          params.append('reference', response.reference);
          params.append('email', customerInfo.email.toLowerCase());
          params.append('name', customerInfo.fullName);
          const verifyRes = await fetch(`/api/verify-payment?${params.toString()}`);
          const verifyData = await verifyRes.json();

          if (verifyData.success) {
            console.log("✅ Invoice generated for custom order:", verifyData.invoiceNumber || 'N/A');
          } else {
            console.warn("⚠️ Invoice generation returned non-success:", verifyData);
          }
        } catch (err) {
          console.error("❌ Error calling verify-payment for invoice:", err);
        }

        // Don't need to create a separate order, but we can still log payment success
        console.log("🎉 Payment successful for custom order!");
        setPaymentSuccessful(true);
        setSuccessReference(response.reference);

        // Clear custom quote from sessionStorage
        sessionStorage.removeItem('customOrderQuote');
        return;
      } else {
        console.log("[Checkout] Full items array from cart:", JSON.stringify(items, null, 2));
        const buyItems = items.filter((item: any) => item.mode === 'buy');
        const rentalItems = items.filter((item: any) => item.mode === 'rent');

        // Buy subtotal (before discount)
        const buySubtotal = buyItems.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);

        // Rental subtotal (with rental days)
        const rentalSubtotal = rentalItems.reduce((sum: number, item: any) => {
          const days = rentalSchedule?.rentalDays || item.rentalDays || 1;
          return sum + (item.price * item.quantity * days);
        }, 0);

        // Apply discount ONLY to buy items
        const buyQuantity = buyItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
        const discountPercent = getDiscountPercentage(buyQuantity);
        const discountAmt = buySubtotal * (discountPercent / 100);
        const buySubtotalAfterDiscount = buySubtotal - discountAmt;

        // Total goods = buy after discount + rental (no discount)
        const goodsSubtotal = buySubtotalAfterDiscount + rentalSubtotal;
        // VAT on goods only - never on the caution fee or delivery
        const taxAmount = calculateVat(goodsSubtotal, vatRate);
        const totalAmount = goodsSubtotal + (cautionFee || 0) + shippingCost + taxAmount;

        // Log the subtotal breakdown for debugging
        console.log('[Checkout] 💰 PRICING BREAKDOWN:', {
          buySubtotal,
          rentalSubtotal,
          goodsSubtotal,
          discountAmount: discountAmt,
          taxAmount,
          cautionFee: cautionFee || 0,
          totalAmount
        });

        // Attach rentalDays to each item for persistence/visibility in admin UI
        const itemsWithRentalDays = items.map((it: any) => {
          const mappedItem = {
            ...it,
            id: it.id,
            name: it.name,
            price: it.price,
            quantity: it.quantity,
            image: it.image || '', // Explicitly include image from cart
            mode: it.mode,
            unitPrice: it.price,
            rentalDays: it.rentalDays || rentalSchedule?.rentalDays || 1,
            selectedSize: it.size,
            selectedColor: it.color,
          };
          console.log(`[Checkout] 📦 Item "${it.name}":`, {
            mode: mappedItem.mode,
            hasMode: !!mappedItem.mode,
            originalMode: it.mode,
            qty: it.quantity,
            price: it.price
          });
          return mappedItem;
        });

        // LOG THE ENTIRE ORDER DATA BEFORE SENDING
        console.log('[Checkout] 🚀 ABOUT TO SEND ORDER TO API:', {
          itemCount: itemsWithRentalDays.length,
          items: itemsWithRentalDays.map((i: any) => ({
            name: i.name,
            mode: i.mode,
            qty: i.quantity
          })),
          total: totalAmount
        });

        // VALIDATE item modes before sending
        const modeValidation = validateCheckoutItemsModes(itemsWithRentalDays);
        if (modeValidation.itemsWithoutMode > 0) {
          console.error('[Checkout] ❌ CRITICAL: Items missing mode field!');
          console.error('[Checkout] This will cause issues in production!');
        }

        // Parse full name into firstName and lastName for unified schema
        const nameParts = (customerInfo.fullName || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        orderData = {
          reference: response.reference,
          email: customerInfo.email.toLowerCase(),
          firstName: firstName,
          lastName: lastName,
          phone: customerInfo.phone,
          buyerId: buyer?.id || null,
          city: customerInfo.city || '',
          address: customerInfo.address || '',
          state: customerInfo.state || '',
          country: customerInfo.country || 'Nigeria',
          orderType: 'regular',
          items: itemsWithRentalDays,
          rentalSchedule: rentalSchedule || null,
          shippingType: shippingOption || 'standard',
          status: paymentMethod === 'manual' ? 'pending' : 'pending', // Both pending, but manual stays longer
          paymentMethod: paymentMethod, // Store payment method
          paymentProofUrl: paymentProofUrl || null, // Store proof URL
          shippingCost: 0,
          subtotal: goodsSubtotal,  // ← CRITICAL FIX: Use goodsSubtotal (buy + rental), not just buySubtotal
          // CRITICAL: Add top-level discount and VAT fields (not just in pricing object)
          discountPercentage: discountPercent,
          discountAmount: discountAmt,
          subtotalAfterDiscount: buySubtotalAfterDiscount,
          vat: taxAmount,
          vatPercent: vatRate * 100,  // VAT % charged on goods only (not caution fee/delivery)
          cautionFee: (cautionFee || 0),  // CRITICAL: Save caution fee to top-level field
          total: totalAmount,
          paymentFee: response.manual ? 0 : pendingPaymentFee(response.reference),  // Flutterwave fee paid by the customer, on top of total
          pricing: {
            subtotal: goodsSubtotal,  // ← Use goodsSubtotal here too
            buySubtotal: buySubtotal,
            rentalSubtotal: rentalSubtotal,
            goodsSubtotal: goodsSubtotal,
            cautionFee: (cautionFee || 0),
            tax: taxAmount,
            shipping: 0,
            total: totalAmount,
            discount: discountAmt,
            discountPercentage: discountPercent,
            subtotalAfterDiscount: buySubtotalAfterDiscount,
          },
          createdAt: new Date().toISOString(),
          paymentVerified: paymentMethod === 'paystack', // Manual payments are not verified yet
        };
      }

      console.log("💾 Saving order to unified endpoint...");
      console.log("Order data:", JSON.stringify(orderData, null, 2));

      // Add idempotency key to prevent duplicate order creation
      const idempotencyKey = response?.reference || `checkout-${Date.now()}`;

      // Use unified endpoint for creating regular orders
      const res = await fetch("/api/orders/unified", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(orderData),
      });

      if (res.ok) {
        const orderRes = await res.json();
        console.log("✅ Order saved to unified system");
        console.log("Invoice generated:", orderRes.invoice?.invoiceNumber || "N/A");
        console.log("Order ID:", orderRes.orderId);

        if (!orderRes.orderId) {
          console.error("❌ ERROR: Order response missing orderId!");
          console.error("Full response:", orderRes);
          setOrderError("Order created but ID not returned. Please contact support.");
          setIsProcessing(false);
          return;
        }

        // Show success message
        console.log("🎉 Payment successful!");
        setPaymentSuccessful(true);
        setSuccessReference(response.reference);

        clearCart();

        // Clear custom quote from sessionStorage
        sessionStorage.removeItem('customOrderQuote');
      } else {
        let errorData: any = {};
        try {
          const text = await res.text();
          console.error("Raw response:", text);
          if (text) {
            errorData = JSON.parse(text);
          }
        } catch (e) {
          console.error("Could not parse error response as JSON");
        }
        console.error("❌ Order save failed with status:", res.status);
        console.error("Error details:", errorData);
        console.error("Full error object:", { status: res.status, statusText: res.statusText, body: errorData });

        // Log the orderData being sent for debugging
        console.error("Order data that was sent:", JSON.stringify(orderData, null, 2));

        setOrderError(errorData?.error || errorData?.details || "Failed to save order. Please contact support.");
      }
    } catch (error) {
      console.error("❌ Error saving order:", error);
      setOrderError("An error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper function to poll for payment
  const pollForPayment = (ref: string, customerEmail: string = '', customerName: string = '', transactionId?: string | number) => {
    let pollCount = 0;
    const maxPolls = 180;
    const pollInterval = setInterval(async () => {
      pollCount++;
      try {
        // Stop polling if payment already processed
        if (paymentProcessed) {
          clearInterval(pollInterval);
          return;
        }

        const params = new URLSearchParams();
        params.append('reference', ref);
        if (customerEmail) params.append('email', customerEmail);
        if (customerName) params.append('name', customerName);
        if (transactionId) params.append('transaction_id', String(transactionId));
        const verifyRes = await fetch(`/api/verify-payment?${params.toString()}`);
        const verifyData = await verifyRes.json();

        if (verifyData.success && (verifyData.status === 'success' || verifyData.status === 'successful')) {
          console.log("✅ Payment verified!");
          clearInterval(pollInterval);
          handlePaymentSuccess({ reference: ref, ...verifyData });
          return;
        }
      } catch (err) {
        console.log("Polling...");
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        setIsProcessing(false);
      }
    }, 1000);
  };

  // Helper function to verify payment
  const verifyAndProcessPayment = async (ref: string, customerEmail: string = '', customerName: string = '', transactionId?: string | number) => {
    try {
      // Skip if payment already processed
      if (paymentProcessed) {
        console.log("⚠️ Payment already processed, skipping verification");
        return;
      }

      const params = new URLSearchParams();
      params.append('reference', ref);
      if (customerEmail) params.append('email', customerEmail);
      if (customerName) params.append('name', customerName);
      if (transactionId) params.append('transaction_id', String(transactionId));
      const res = await fetch(`/api/verify-payment?${params.toString()}`);
      const data = await res.json();

      if (data.success && (data.status === 'success' || data.status === 'successful')) {
        console.log("✅ Payment confirmed!");
        handlePaymentSuccess({ reference: ref, ...data });
      } else {
        console.log("Payment pending or failed");
        const customerInfo = guestCustomer;
        pollForPayment(ref, customerInfo?.email || '', customerInfo?.fullName || '', transactionId);
      }
    } catch (err) {
      console.error("Verification error:", err);
      pollForPayment(ref, '', '', transactionId);
    }
  };

  // ===== CALCULATE TOTALS =====
  let shippingCost, taxEstimate, totalAmount, displayItems, displayTotal, displaySubtotal, discountAmount = 0, discountPercentage = 0, displaySubtotalAfterDiscount = 0;

  if (customQuote) {
    // Custom order totals - ensure all values are numbers
    const quotedPrice = typeof customQuote.quotedPrice === 'number' ? customQuote.quotedPrice : parseFloat(customQuote.quotedPrice) || 0;
    const quotedVAT = typeof customQuote.quotedVAT === 'number' ? customQuote.quotedVAT : parseFloat(customQuote.quotedVAT) || 0;
    const quotedTotal = typeof customQuote.quotedTotal === 'number' ? customQuote.quotedTotal : parseFloat(customQuote.quotedTotal) || 0;

    // 🎁 Extract discount information from custom quote
    discountPercentage = customQuote.discountPercentage || 0;
    discountAmount = customQuote.discountAmount || 0;

    shippingCost = 0;
    taxEstimate = quotedVAT;
    totalAmount = quotedTotal || (quotedPrice + quotedVAT);

    // Build display items from quote items if available
    if (customQuote.items && Array.isArray(customQuote.items) && customQuote.items.length > 0) {
      displayItems = customQuote.items.map((item: any) => ({
        name: item.itemName || 'Custom Item',
        quantity: item.quantity || 1,
        price: item.unitPrice || 0,
        total: (item.quantity || 1) * (item.unitPrice || 0)
      }));
    } else {
      displayItems = [{
        name: `Custom Order`,
        quantity: customQuote.quantity || 1,
        price: quotedPrice,
        total: quotedPrice * (customQuote.quantity || 1)
      }];
    }

    displaySubtotal = quotedPrice;
    displayTotal = totalAmount;

    console.log('[Checkout] Calculated custom quote totals:', {
      quotedPrice,
      quotedVAT,
      quotedTotal,
      discountPercentage,
      discountAmount,
      displayItems,
      displaySubtotal,
      displayTotal,
    });
  } else {
    // Cart totals - with discount calculation ONLY on buy items
    shippingCost = 0;

    // Separate buy and rental items
    const buyItems = items.filter(item => item.mode === 'buy');
    const rentalItems = items.filter(item => item.mode === 'rent');

    // Calculate buy subtotal
    const buySubtotal = buyItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Calculate rental total (with rental days)
    const rentalSubtotal = rentalItems.reduce((sum, item) => {
      const days = rentalSchedule?.rentalDays || item.rentalDays || 1;
      return sum + (item.price * item.quantity * days);
    }, 0);

    // Apply discount ONLY to buy items, NOT rentals
    const buyQuantity = buyItems.reduce((sum, item) => sum + item.quantity, 0);
    discountPercentage = getDiscountPercentage(buyQuantity);
    discountAmount = buySubtotal * (discountPercentage / 100);
    const buySubtotalAfterDiscount = buySubtotal - discountAmount;

    // Total goods/services = buy after discount + rental (no discount)
    const goodsSubtotal = buySubtotalAfterDiscount + rentalSubtotal;

    // Tax calculated on goods only (not caution fee or delivery)
    taxEstimate = calculateVat(goodsSubtotal, vatRate);

    // Include caution fee in displayed subtotal and in final total
    displaySubtotal = buySubtotal + rentalSubtotal + (cautionFee || 0);
    displaySubtotalAfterDiscount = goodsSubtotal + (cautionFee || 0);
    totalAmount = displaySubtotalAfterDiscount + shippingCost + taxEstimate;
    displayItems = items;
    displayTotal = totalAmount;

    console.log('[Checkout] Calculated cart totals with discount on buy only:', {
      buySubtotal,
      buyQuantity,
      discountPercentage,
      discountAmount,
      buySubtotalAfterDiscount,
      rentalSubtotal,
      goodsSubtotal,
      taxEstimate,
      cautionFee,
      displaySubtotal,
      displaySubtotalAfterDiscount,
      displayTotal,
    });
  }

  // Customers pay Flutterwave's processing fee on online payments (not on bank transfers)
  const { fee: paymentFee, loading: paymentFeeLoading } = usePaymentFee(displayTotal, paymentMethod === 'paystack');
  const payableTotal = Math.round((displayTotal + paymentFee) * 100) / 100;

  if (!isHydrated) return null;

  // ===== PAYMENT SUCCESS - Show success message =====
  if (paymentSuccessful) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto px-4 py-12 w-full">
          <div className="bg-white rounded-lg shadow-md border border-green-200 p-12">
            <div className="text-center">
              {/* Success Icon */}
              <div className="mb-6 flex justify-center">
                <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-5xl">📦</span>
                </div>
              </div>

              {/* Title */}
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Track Your Order</h1>

              {/* Description */}
              <p className="text-gray-600 text-lg mb-8">
                Check messages on your product card and visit the dashboard to track your order progress in real-time
              </p>

              {/* Buttons */}
              <div className="space-y-3 max-w-sm mx-auto">
                <Link href="/dashboard?tab=orders" className="block w-full bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-700 hover:to-green-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg">
                  Go to Dashboard Orders
                </Link>
                <Link href="/" className="block w-full bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-lg font-semibold transition">
                  Continue Shopping
                </Link>
              </div>

              {/* Reference Number */}
              {successReference && (
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Order Reference</p>
                  <p className="text-xl font-semibold text-gray-900">{successReference}</p>
                </div>
              )}
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ===== EMPTY CART - But allow if custom order quote exists or payment was successful =====
  if (items.length === 0 && !customQuote && !paymentSuccessful) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-12">
            <div className="text-center mb-8">
              <ShoppingBag className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Your cart is empty</h1>
              <p className="text-gray-600 mb-8">Add items to proceed with checkout.</p>
              <div className="space-y-3 max-w-sm mx-auto">
                <Link href="/" className="block w-full bg-lime-600 hover:bg-lime-700 text-white px-6 py-3 rounded-lg font-semibold transition">
                  Continue Shopping
                </Link>
                <Link href="/dashboard?tab=invoices" className="block w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-6 py-3 rounded-lg font-semibold transition shadow-md hover:shadow-lg">
                  View Invoices
                </Link>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ===== CHECKOUT FORM =====
  return (
    <div className="min-h-screen flex flex-col bg-gray-50/50">
      <Header />
      <main className="flex-1 max-w-6xl mx-auto px-4 py-8 w-full pt-20 sm:pt-24 md:pt-20">
        <div className="mb-6">
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-purple-600 transition"
          >
            ← Back to Cart
          </Link>
        </div>
        <div className="grid lg:grid-cols-3 gap-8 items-start">
          {/* Left Column: Billing/Shipping & Payment Information */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Customer & Shipping Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 md:p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2.5">
                <Truck className="h-6 w-6 text-purple-600" />
                Shipping Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="Email Address"
                    value={guestCustomer.email}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="First & Last Name"
                    value={guestCustomer.fullName}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, fullName: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Phone Number"
                    value={guestCustomer.phone}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>

                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Delivery Address
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Street Address, Apartment, Suite, etc."
                    value={guestCustomer.address}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, address: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    City
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="City"
                    value={guestCustomer.city}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, city: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    State / Region
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="State / Region"
                    value={guestCustomer.state}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, state: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                    Country
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Country"
                    value={guestCustomer.country}
                    onChange={(e) => setGuestCustomer({ ...guestCustomer, country: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/20 focus:border-purple-600 text-gray-900 transition"
                  />
                </div>
              </div>
            </div>


          </div>

          {/* Right Column: Order Summary & Actions */}
          <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-24">
            
            {/* Order Summary Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2 pb-3 border-b border-gray-100">
                <ShoppingBag className="h-5 w-5 text-purple-600" />
                Order Summary
              </h3>
              
              {/* Items in Cart */}
              <div className="space-y-4 max-h-60 overflow-y-auto pr-1 mb-4">
                {displayItems.map((item: any, idx: number) => {
                  const isRental = item.mode === 'rent';
                  const itemMode = item.mode ? (isRental ? 'RENTAL' : 'BUY') : '';
                  const modeColor = isRental ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700';
                  const modeEmoji = isRental ? '🔄' : '🛍️';

                  return (
                    <div key={idx} className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate">{item.name}</span>
                          {itemMode && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${modeColor} whitespace-nowrap`}>
                              {modeEmoji} {itemMode}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Qty: {item.quantity || 1}
                          {isRental && rentalSchedule?.rentalDays && (
                            <span> • {rentalSchedule.rentalDays}d rental</span>
                          )}
                          {(item.color || item.selectedColor) && (
                            <span> • {item.color || item.selectedColor}</span>
                          )}
                          {(item.size || item.selectedSize) && (
                            <span> • Size {item.size || item.selectedSize}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 whitespace-nowrap">₦{((item.total || item.price * (item.quantity || 1)) || 0).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>

              {/* Pricing breakdown */}
              <div className="space-y-2.5 pt-3 border-t border-gray-100 text-sm text-gray-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-900">₦{displaySubtotal.toLocaleString()}</span>
                </div>
                
                {/* Discount */}
                {!customQuote && discountPercentage > 0 && (
                  <div className="flex justify-between text-xs text-green-600 bg-green-50 px-2 py-1.5 rounded">
                    <span>🎁 Discount ({discountPercentage}%)</span>
                    <span>-₦{Math.round(discountAmount).toLocaleString()}</span>
                  </div>
                )}
                
                {/* Discount for custom orders */}
                {customQuote && customQuote.discountPercentage > 0 && (
                  <div className="flex justify-between text-xs text-green-600 bg-green-50 px-2 py-1.5 rounded">
                    <span>🎁 Bulk Discount ({customQuote.discountPercentage}%)</span>
                    <span>-₦{customQuote.discountAmount.toLocaleString()}</span>
                  </div>
                )}
                
                {/* Caution Fee (rentals) */}
                {cautionFee > 0 && (
                  <div className="flex justify-between text-amber-700 bg-amber-50/50 px-2 py-1.5 rounded text-xs">
                    <span>🔒 Caution Fee (Refundable)</span>
                    <span className="font-semibold">₦{Math.round(cautionFee).toLocaleString()}</span>
                  </div>
                )}
                
                <div className="flex justify-between">
                  <span>
                    {customQuote
                      ? (typeof customQuote.vatPercent === 'number' ? `VAT (${customQuote.vatPercent}%)` : 'VAT')
                      : `VAT (${formatVatPercent(vatRate)})`}
                  </span>
                  <span className="font-semibold text-gray-900">₦{Math.round(taxEstimate).toLocaleString()}</span>
                </div>
                
                {paymentMethod === 'paystack' && (
                  <div className="flex justify-between">
                    <span>Payment Processing Fee</span>
                    <span className="font-semibold text-gray-900">
                      {paymentFeeLoading ? 'Calculating...' : `₦${paymentFee.toLocaleString()}`}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-base font-bold pt-3 border-t border-gray-100 text-gray-900">
                  <span>Total Amount</span>
                  <span className="text-purple-600">₦{payableTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Error display */}
            {orderError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                <div>
                  <strong>Payment Error:</strong> {orderError}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={async () => {
                  console.log("Pay button clicked. Method:", paymentMethod);

                  // Use the unified form state guestCustomer
                  const customerInfo = guestCustomer;

                  if (!customerInfo?.fullName || !customerInfo?.email || !customerInfo?.phone || !customerInfo?.address || !customerInfo?.city || !customerInfo?.state || !customerInfo?.country) {
                    setOrderError("Please provide your full name, email, phone number, delivery address, city, state, and country.");
                    return;
                  }

                  // Validate email format
                  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  if (!emailRegex.test(customerInfo.email)) {
                    setOrderError("Please provide a valid email address");
                    return;
                  }

                  // Manual Payment Flow
                  if (paymentMethod === 'manual') {
                    if (!paymentProofUrl) {
                      setOrderError("Please upload a proof of payment receipt before proceeding.");
                      return;
                    }

                    setIsProcessing(true);
                    setOrderError(null);

                    try {
                      const ref = `MAN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                      console.log("📝 Processing Manual Payment:", { ref, amount: displayTotal, email: customerInfo.email });

                      // Call handlePaymentSuccess directly with manual reference
                      await handlePaymentSuccess({ reference: ref, manual: true });
                    } catch (err) {
                      console.error("Manual payment error:", err);
                      setOrderError("Failed to process request. Please try again.");
                      setIsProcessing(false);
                    }
                    return;
                  }

                  // Flutterwave Logic
                  if (!process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY) {
                    setOrderError("Online payment service is currently undergoing maintenance. Please use Bank Transfer.");
                    return;
                  }
                  if (paymentFeeLoading) return;

                  setIsProcessing(true);
                  setOrderError(null);

                  try {
                    const ref = `EMPI-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const amountInKobo = Math.round(payableTotal * 100);

                    console.log("💳 Payment Details:", { ref, amount: payableTotal, paymentFee, email: customerInfo.email });

                    // Store payment info in localStorage
                    localStorage.setItem('empi_pending_payment', JSON.stringify({
                      reference: ref,
                      email: customerInfo.email,
                      amount: amountInKobo,
                      paymentFee,
                      timestamp: Date.now()
                    }));

                    // Attempt modal first if Flutterwave is available
                    let modalAttempted = false;
                    if (typeof window !== "undefined" && (window as any).FlutterwaveCheckout) {
                      try {
                        console.log("Attempting Flutterwave modal...");
                        const handler = (window as any).FlutterwaveCheckout({
                          public_key: process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY,
                          tx_ref: ref,
                          amount: payableTotal, // Flutterwave expects Naira amount
                          currency: "NGN",
                          payment_options: "card, banktransfer, ussd",
                          customer: {
                            email: customerInfo.email,
                            phone_number: customerInfo.phone,
                            name: customerInfo.fullName,
                          },
                          customizations: {
                            title: "EMPI Costumes",
                            description: "Payment for EMPI Order",
                            logo: `${window.location.origin}/logo/EMPI-2k24-LOGO-1.PNG`,
                          },
                          callback: (response: any) => {
                            console.log("Flutterwave onSuccess called with response:", response);
                            if (response.status === "successful" || response.status === "completed") {
                              const transId = response.transaction_id || response.id;
                              handlePaymentSuccess({ reference: ref, transaction_id: transId, ...response });
                            } else {
                              setOrderError(response.message || "Payment not successful. Please try again.");
                              setIsProcessing(false);
                            }
                            if (handler && typeof handler.close === "function") {
                              handler.close();
                            }
                          },
                          onclose: () => {
                            console.log("Flutterwave modal closed - verifying payment...");
                            setTimeout(() => {
                              verifyAndProcessPayment(ref, customerInfo.email, customerInfo.fullName);
                            }, 1500);
                          },
                        });
                        modalAttempted = true;
                      } catch (err) {
                        console.warn("Modal failed, using redirect:", err);
                      }
                    }

                    // Fallback to backend initialization
                    if (!modalAttempted) {
                      console.log("Using backend payment initialization");
                      try {
                        const initRes = await fetch('/api/initialize-payment', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: customerInfo.email,
                            amount: amountInKobo,
                            reference: ref,
                            firstname: customerInfo.fullName.split(" ")[0] || "Customer",
                            lastname: customerInfo.fullName.split(" ").slice(1).join(" ") || "",
                            phone: customerInfo.phone,
                          }),
                        });

                        const initData = await initRes.json();
                        if (initRes.ok && initData.authorization_url) {
                          console.log("✅ Payment initialized, redirecting to:", initData.authorization_url);
                          window.location.href = initData.authorization_url;
                        } else {
                          setOrderError(initData.error || "Failed to initialize payment");
                          setIsProcessing(false);
                        }
                      } catch (err) {
                        console.error("Payment initialization error:", err);
                        setOrderError("Failed to initialize payment. Please try again.");
                        setIsProcessing(false);
                      }
                    }
                  } catch (error) {
                    console.error("Payment error:", error);
                    setIsProcessing(false);
                    setOrderError("Failed to initialize payment. Please try again.");
                  }
                }}
                disabled={isProcessing || (paymentMethod === 'paystack' && paymentFeeLoading)}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold py-3.5 px-6 rounded-xl transition shadow-md shadow-green-600/10 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  `Pay ₦${payableTotal.toLocaleString()}`
                )}
              </button>
            </div>

            {/* Secured by Flutterwave Badge */}
            <div className="text-center pt-2">
              <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
                🔒 Secured by <span className="font-semibold text-gray-600">Flutterwave</span>
              </p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

