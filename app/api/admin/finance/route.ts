import { requireAdmin } from '@/lib/adminAuth';
import { NextRequest, NextResponse } from 'next/server';
import UnifiedOrder from '@/lib/models/UnifiedOrder';
import Order from '@/lib/models/Order';
import Expense from '@/lib/models/Expense';
import CustomOrder from '@/lib/models/CustomOrder';
import connectDB from '@/lib/mongodb';

interface FinanceMetrics {
  totalRevenue: number;
  totalIncome: number;
  totalExpenses: number;
  pendingAmount: number;
  completedAmount: number;
  totalSalesAmount: number;
  totalRentalsAmount: number;
  completedOutgoing: number;
  annualTurnover: number;
  businessSize: 'small' | 'medium' | 'large';
  taxBreakdown: TaxBreakdown;
  monthlyTax: MonthlyTaxBreakdown;
  weeklyProjection: WeeklyData[];
  transactionBreakdown: TransactionBreakdown;
  profitMargin: number;
  averageOrderValue: number;
  conversionMetrics: ConversionMetrics;
}

interface TaxBreakdown {
  vat: VATBreakdown;
  corporateIncomeTax: number;
  educationTax: number;
  totalAnnualTax: number;
}

interface VATBreakdown {
  rate: number;
  totalSalesExVAT: number;
  outputVAT: number;
  inputVAT: number;
  vatPayable: number;
}

interface MonthlyTaxBreakdown {
  estimatedMonthlyVAT: number;
  estimatedMonthlyCIT: number;
  estimatedMonthlyEducationTax: number;
  estimatedMonthlyTotal: number;
}

interface WeeklyData {
  week: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

interface TransactionBreakdown {
  sales: number;
  rentals: number;
  customOrders: number;
  returns: number;
  refunds: number;
}

interface ConversionMetrics {
  totalTransactions: number;
  completedTransactions: number;
  pendingTransactions: number;
  cancelledTransactions: number;
  conversionRate: number;
}

interface SalesRentalsData {
  totalSalesAmount: number;
  totalRentalsAmount: number;
  totalSalesCount: number;
  totalRentalsCount: number;
}

// ============================================
// SALES & RENTALS CALCULATION FUNCTION
// ============================================

/**
 * Calculate total sales and rentals from approved/completed orders
 * 
 * IMPORTANT: Items may not have individual prices (only order.total exists)
 * FALLBACK: Estimate based on ratio of items with mode='buy' vs mode='rent'
 * 
 * DATA SOURCE:
 * - Orders collection → items array → each item with { price, quantity, mode }
 * - If item.price missing: Use order.total distributed by item mode ratio
 * - For Sales: mode === 'buy' (regular purchase items)
 * - For Rentals: mode === 'rent' (rental items with rentalDays)
 */
function calculateSalesAndRentals(completedOrders: any[]): SalesRentalsData {
  console.log('[Finance] 📊 Calculating sales & rentals from', completedOrders.length, 'completed orders');

  let totalSalesAmount = 0;
  let totalRentalsAmount = 0;
  let totalSalesCount = 0;
  let totalRentalsCount = 0;

  completedOrders.forEach((order: any) => {
    console.log('[Finance] 📦 Order:', {
      orderNumber: order.orderNumber,
      total: order.total,
      itemsCount: order.items?.length || 0,
      status: order.status,
    });

    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      // Check if items have prices
      const itemsWithPrices = order.items.filter((i: any) => i.unitPrice && i.unitPrice > 0);
      const hasValidPrices = itemsWithPrices.length === order.items.length;

      if (hasValidPrices) {
        // Method 1: Use individual item prices (when available)
        console.log('[Finance]   Using individual item prices');
        order.items.forEach((item: any) => {
          const itemAmount = (item.unitPrice || 0) * (item.quantity || 1);
          
          if (item.mode === 'buy' || item.mode === 'sale') {
            totalSalesAmount += itemAmount;
            totalSalesCount += item.quantity || 1;
          } else if (item.mode === 'rent' || item.mode === 'rental') {
            totalRentalsAmount += itemAmount;
            totalRentalsCount += item.quantity || 1;
          }
        });
      } else {
        // Method 2: Estimate based on item count ratio (when prices are missing)
        console.log('[Finance]   ⚠️ Item prices missing - estimating from order total');
        const salesItems = order.items.filter((i: any) => i.mode === 'buy' || i.mode === 'sale');
        const rentalItems = order.items.filter((i: any) => i.mode === 'rent' || i.mode === 'rental');
        const totalItems = order.items.length;

        if (totalItems > 0) {
          const salesRatio = salesItems.length / totalItems;
          const rentalRatio = rentalItems.length / totalItems;
          
          const estimatedSales = (order.total || 0) * salesRatio;
          const estimatedRental = (order.total || 0) * rentalRatio;

          totalSalesAmount += estimatedSales;
          totalRentalsAmount += estimatedRental;
          totalSalesCount += salesItems.length;
          totalRentalsCount += rentalItems.length;

          console.log('[Finance]   Estimated split:', {
            salesRatio: (salesRatio * 100).toFixed(1) + '%',
            rentalRatio: (rentalRatio * 100).toFixed(1) + '%',
            estimatedSales: estimatedSales.toFixed(2),
            estimatedRental: estimatedRental.toFixed(2),
          });
        }
      }
    }
  });

  const result = {
    totalSalesAmount: Math.round(totalSalesAmount * 100) / 100,
    totalRentalsAmount: Math.round(totalRentalsAmount * 100) / 100,
    totalSalesCount,
    totalRentalsCount,
  };

  console.log('[Finance] 💰 Sales & Rentals Totals:', {
    sales: `₦${result.totalSalesAmount}`,
    rentals: `₦${result.totalRentalsAmount}`,
    totalSalesCount,
    totalRentalsCount,
  });

  return result;
}

// ============================================
// TAX CALCULATION FUNCTIONS
// ============================================

/**
 * Determine business size based on annual turnover
 * - Small: ₦0 – ₦25 million
 * - Medium: ₦25 million – ₦100 million
 * - Large: Above ₦100 million
 */
function determineBusinessSize(annualTurnover: number): 'small' | 'medium' | 'large' {
  const SMALL_THRESHOLD = 25000000; // ₦25 million
  const MEDIUM_THRESHOLD = 100000000; // ₦100 million

  if (annualTurnover < SMALL_THRESHOLD) return 'small';
  if (annualTurnover < MEDIUM_THRESHOLD) return 'medium';
  return 'large';
}

/**
 * Calculate VAT (7.5%) - Applies to all business sizes
 */
function calculateVAT(totalRevenue: number, estimatedSupplierCosts: number = 0): VATBreakdown {
  const VAT_RATE = 0.075; // 7.5%
  const totalSalesExVAT = totalRevenue / (1 + VAT_RATE);
  const outputVAT = totalSalesExVAT * VAT_RATE;
  const inputVATBase = estimatedSupplierCosts > 0 ? estimatedSupplierCosts : totalRevenue * 0.35;
  const inputVAT = inputVATBase * VAT_RATE;
  const vatPayable = Math.max(0, outputVAT - inputVAT);

  return {
    rate: VAT_RATE * 100,
    totalSalesExVAT: Math.round(totalSalesExVAT * 100) / 100,
    outputVAT: Math.round(outputVAT * 100) / 100,
    inputVAT: Math.round(inputVAT * 100) / 100,
    vatPayable: Math.round(vatPayable * 100) / 100,
  };
}

/**
 * Calculate Corporate Income Tax (CIT)
 * Small: 0%, Medium: 20%, Large: 30%
 */
function calculateCIT(annualTurnover: number, taxableProfit: number): number {
  const businessSize = determineBusinessSize(annualTurnover);
  switch (businessSize) {
    case 'small': return 0;
    case 'medium': return taxableProfit * 0.20;
    case 'large': return taxableProfit * 0.30;
    default: return 0;
  }
}

/**
 * Calculate Education Tax (EDT)
 * Only for large companies: 3% of taxable profit
 */
function calculateEducationTax(annualTurnover: number, taxableProfit: number): number {
  const businessSize = determineBusinessSize(annualTurnover);
  if (businessSize === 'large') {
    return taxableProfit * 0.03;
  }
  return 0;
}

/**
 * Generate comprehensive annual tax summary
 */
function generateAnnualTaxSummary(
  annualTurnover: number,
  totalRevenue: number,
  totalExpenses: number,
  actualInputVAT: number = 0,
  actualOutputVAT?: number
): TaxBreakdown {
  const taxableProfit = totalRevenue - totalExpenses;
  const vatBreakdown = calculateVAT(totalRevenue, totalExpenses);

  // Use the VAT actually charged on orders (products only - excludes logistics and caution fees)
  // instead of estimating it from gross revenue
  if (typeof actualOutputVAT === 'number') {
    vatBreakdown.outputVAT = Math.round(actualOutputVAT * 100) / 100;
    vatBreakdown.totalSalesExVAT = Math.round((totalRevenue - actualOutputVAT) * 100) / 100;
  }
  
  // Use actual input VAT from expenses if provided
  if (actualInputVAT > 0) {
    vatBreakdown.inputVAT = Math.round(actualInputVAT * 100) / 100;
  }
  vatBreakdown.vatPayable = Math.round(Math.max(0, vatBreakdown.outputVAT - vatBreakdown.inputVAT) * 100) / 100;
  
  const corporateIncomeTax = calculateCIT(annualTurnover, taxableProfit);
  const educationTax = calculateEducationTax(annualTurnover, taxableProfit);
  const totalAnnualTax = vatBreakdown.vatPayable + corporateIncomeTax + educationTax;

  return {
    vat: vatBreakdown,
    corporateIncomeTax: Math.round(corporateIncomeTax * 100) / 100,
    educationTax: Math.round(educationTax * 100) / 100,
    totalAnnualTax: Math.round(totalAnnualTax * 100) / 100,
  };
}

/**
 * Calculate monthly tax estimates
 */
function getMonthlyTaxEstimates(taxBreakdown: TaxBreakdown): MonthlyTaxBreakdown {
  return {
    estimatedMonthlyVAT: Math.round((taxBreakdown.vat.vatPayable / 12) * 100) / 100,
    estimatedMonthlyCIT: Math.round((taxBreakdown.corporateIncomeTax / 12) * 100) / 100,
    estimatedMonthlyEducationTax: Math.round((taxBreakdown.educationTax / 12) * 100) / 100,
    estimatedMonthlyTotal: Math.round((taxBreakdown.totalAnnualTax / 12) * 100) / 100,
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    await connectDB();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Get current month date range
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    // Query ALL sources: Online orders + Offline orders + Expenses
    console.log('[Finance API] ⏳ Fetching from all sources (online + offline + expenses)...');
    
    const [allUnifiedOrders, offlineOrders, allExpenses, allCustomOrders] = await Promise.all([
      UnifiedOrder.find({}).lean().catch((err: any) => {
        console.log('[Finance API] ⚠️ Error querying UnifiedOrder:', err.message);
        return [];
      }),
      Order.find({ isOffline: true }).lean().catch((err: any) => {
        console.log('[Finance API] ⚠️ Error querying offline orders:', err.message);
        return [];
      }),
      Expense.find({}).lean().catch((err: any) => {
        console.log('[Finance API] ⚠️ Error querying expenses:', err.message);
        return [];
      }),
      CustomOrder.find({}).lean().catch((err: any) => {
        console.log('[Finance API] ⚠️ Error querying custom orders:', err.message);
        return [];
      }),
    ]);

    console.log('[Finance API] 📊 DATA SUMMARY:', {
      onlineOrders: allUnifiedOrders.length,
      offlineOrders: offlineOrders.length,
      expenses: allExpenses.length,
      customOrders: allCustomOrders.length,
      totalOrders: allUnifiedOrders.length + offlineOrders.length,
    });

    // Log samples
    if (allUnifiedOrders.length > 0) {
      console.log('[Finance API] 📋 Sample online order:', {
        orderNumber: allUnifiedOrders[0].orderNumber,
        total: allUnifiedOrders[0].total,
      });
    }
    if (offlineOrders.length > 0) {
      console.log('[Finance API] 📋 Sample offline order:', {
        orderNumber: offlineOrders[0].orderNumber,
        total: offlineOrders[0].total,
        isOffline: offlineOrders[0].isOffline,
      });
    }
    if (allExpenses.length > 0) {
      console.log('[Finance API] 📋 Sample expense:', {
        description: allExpenses[0].description,
        amount: allExpenses[0].amount,
        category: allExpenses[0].category,
      });
    }

    // Combine all orders: online + offline
    const mergedOrders = [...allUnifiedOrders, ...offlineOrders];

    // If no orders or expenses exist, return all zeros
    if (mergedOrders.length === 0 && allCustomOrders.length === 0 && allExpenses.length === 0) {
      console.log('[Finance API] ❌ No data found - returning zero metrics');
      
      const zeroMetrics: FinanceMetrics = {
        totalRevenue: 0,
        totalIncome: 0,
        totalExpenses: 0,
        pendingAmount: 0,
        completedAmount: 0,
        totalSalesAmount: 0,
        totalRentalsAmount: 0,
        completedOutgoing: 0,
        annualTurnover: 0,
        businessSize: 'small',
        taxBreakdown: {
          vat: { rate: 7.5, totalSalesExVAT: 0, outputVAT: 0, inputVAT: 0, vatPayable: 0 },
          corporateIncomeTax: 0,
          educationTax: 0,
          totalAnnualTax: 0,
        },
        monthlyTax: {
          estimatedMonthlyVAT: 0,
          estimatedMonthlyCIT: 0,
          estimatedMonthlyEducationTax: 0,
          estimatedMonthlyTotal: 0,
        },
        weeklyProjection: [],
        transactionBreakdown: { sales: 0, rentals: 0, customOrders: 0, returns: 0, refunds: 0 },
        profitMargin: 0,
        averageOrderValue: 0,
        conversionMetrics: {
          totalTransactions: 0,
          completedTransactions: 0,
          pendingTransactions: 0,
          cancelledTransactions: 0,
          conversionRate: 0,
        },
      };
      
      const response = NextResponse.json({ success: true, metrics: zeroMetrics }, { status: 200 });
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');
      return response;
    }

    console.log('[Finance API] ✅ Using', mergedOrders.length, 'total orders (merged from all sources)');

    // Calculate financial metrics
    const currentMonthOrders = mergedOrders.filter(
      (order: any) =>
        new Date(order.createdAt) >= monthStart &&
        new Date(order.createdAt) <= monthEnd
    );

    const currentMonthCustomOrders = allCustomOrders.filter(
      (order: any) =>
        new Date(order.createdAt) >= monthStart &&
        new Date(order.createdAt) <= monthEnd
    );

    // REVENUE CALCULATION - CRITICAL FOR CONSISTENCY
    // APPROVED STATUS = Revenue recognized (payment verified, order locked in)
    // Revenue MUST persist from approved through all delivery/completion statuses
    const completedOrders = mergedOrders.filter(
      (order: any) =>
        order.status === 'approved' ||
        order.status === 'confirmed' ||
        order.status === 'processing' ||
        order.status === 'packed' ||
        order.status === 'ready_for_delivery' ||
        order.status === 'shipped' ||
        order.status === 'delivered' ||
        order.status === 'completed' ||
        order.paymentStatus === 'confirmed'
    );

    // Pending orders ONLY - awaiting approval (not counted in revenue)
    const pendingOrders = mergedOrders.filter(
      (order: any) => 
        order.status === 'pending' &&
        order.paymentStatus !== 'confirmed'
    );

    const completedRevenue = completedOrders.reduce(
      (sum: number, order: any) => sum + (order.total || 0),
      0
    );

    const pendingRevenue = pendingOrders.reduce(
      (sum: number, order: any) => sum + (order.total || 0),
      0
    );

    // Custom order revenue
    const completedCustomOrders = allCustomOrders.filter(
      (order: any) => order.status === 'completed'
    );
    const pendingCustomOrders = allCustomOrders.filter(
      (order: any) =>
        order.status === 'pending' ||
        order.status === 'approved' ||
        order.status === 'in-progress'
    );

    const customOrderCompleteRevenue = completedCustomOrders.reduce(
      (sum: number, order: any) => sum + (order.quotedPrice || 0),
      0
    );

    const customOrderPendingRevenue = pendingCustomOrders.reduce(
      (sum: number, order: any) => sum + (order.quotedPrice || 0),
      0
    );

    // Total calculations
    const totalCompletedRevenue = completedRevenue + customOrderCompleteRevenue;
    const totalPendingRevenue = pendingRevenue + customOrderPendingRevenue;
    // ✅ CRITICAL: Total revenue = COMPLETED revenue ONLY
    // Pending orders are shown separately - they should NOT affect total revenue
    // When pending → approved, revenue stays the same (both are counted)
    const totalRevenue = totalCompletedRevenue;

    // Calculate ACTUAL expenses from database (not estimated)
    // Sum all expenses (both online and offline)
    const totalExpenses = allExpenses.reduce((sum: number, expense: any) => {
      return sum + (expense.amount || 0);
    }, 0);

    // Calculate actual INPUT VAT from expenses (deductible VAT)
    const totalInputVAT = allExpenses.reduce((sum: number, expense: any) => {
      const isVATApplicable = expense.isVATApplicable !== false; // Default to true
      return sum + (isVATApplicable ? (expense.vat || 0) : 0);
    }, 0);

    console.log('[Finance API] 💰 Expense & VAT Calculation:', {
      totalExpenses,
      totalInputVAT,
      expenseCount: allExpenses.length,
      vatableExpenses: allExpenses.filter((e: any) => e.isVATApplicable !== false).length,
      avgExpense: allExpenses.length > 0 ? (totalExpenses / allExpenses.length).toFixed(2) : 0,
    });

    // Calculate gross profit
    const grossProfit = totalRevenue - totalExpenses;

    // ============================================
    // COMPREHENSIVE NIGERIAN TAX CALCULATIONS
    // ============================================
    // Project annual turnover from current month
    const currentDate = new Date();
    const daysInCurrentMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0
    ).getDate();
    const daysElapsedInMonth = currentDate.getDate();
    const estimatedMonthlyRevenue =
      (totalRevenue / daysElapsedInMonth) * daysInCurrentMonth;
    const annualTurnover = estimatedMonthlyRevenue * 12;

    // Output VAT = VAT actually charged on recognised orders (legacy custom orders: 7.5% inside quotedPrice)
    const totalOutputVAT =
      completedOrders.reduce((sum: number, order: any) => sum + (order.vat || 0), 0) +
      completedCustomOrders.reduce((sum: number, order: any) => {
        if (typeof order.vat === 'number') return sum + order.vat;
        const quoted = order.quotedPrice || 0;
        return sum + quoted * (0.075 / 1.075);
      }, 0);

    // Generate comprehensive tax breakdown (with actual input VAT from expenses)
    const taxBreakdown = generateAnnualTaxSummary(
      annualTurnover,
      totalRevenue,
      totalExpenses,
      totalInputVAT,  // Pass actual input VAT from expenses
      totalOutputVAT
    );

    // Get monthly tax estimates
    const monthlyTax = getMonthlyTaxEstimates(taxBreakdown);

    // Additional metrics
    const businessSize = determineBusinessSize(annualTurnover);

    // Weekly projection (current week and next 3 weeks)
    const weeklyProjection = calculateWeeklyProjection(
      mergedOrders,
      currentYear,
      currentMonth
    );

    // Transaction breakdown
    const transactionBreakdown = calculateTransactionBreakdown(
      mergedOrders,
      allCustomOrders
    );

    // Calculate total sales and rentals using the new function
    const salesRentalsData = calculateSalesAndRentals(completedOrders);
    const totalSalesAmount = salesRentalsData.totalSalesAmount;
    const totalRentalsAmount = salesRentalsData.totalRentalsAmount;

    // Add custom order revenue to total sales (custom orders are considered sales)
    const completedCustomOrderRevenue = completedCustomOrders.reduce(
      (sum: number, order: any) => sum + (order.quotedPrice || 0),
      0
    );

    // Total Income = Total Sales (including custom orders) + Total Rentals
    const totalIncomeCalculated = (totalSalesAmount + completedCustomOrderRevenue) + totalRentalsAmount;

    // Calculate completed outgoing (refunds + returns)
    const refundedOrders = mergedOrders.filter(
      (order: any) => order.status === 'refunded'
    );
    const returnedOrders = mergedOrders.filter(
      (order: any) => order.status === 'returned'
    );
    const completedOutgoing = 
      refundedOrders.reduce((sum: number, order: any) => sum + (order.total || 0), 0) +
      returnedOrders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);

    // Profit margin
    const profitMargin =
      totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : '0';

    // Average order value
    const completedOrdersCount = completedOrders.length;
    const averageOrderValue =
      completedOrdersCount > 0 ? completedRevenue / completedOrdersCount : 0;

    // Conversion metrics
    const conversionMetrics: ConversionMetrics = {
      totalTransactions: mergedOrders.length + allCustomOrders.length,
      completedTransactions:
        completedOrders.length + completedCustomOrders.length,
      pendingTransactions:
        pendingOrders.length + pendingCustomOrders.length,
      cancelledTransactions: mergedOrders.filter(
        (order: any) => order.status === 'cancelled'
      ).length,
      conversionRate:
        mergedOrders.length > 0
          ? (
              ((completedOrders.length / mergedOrders.length) * 100).toFixed(2) as any
            )
          : 0,
    };

    const metrics: FinanceMetrics = {
      totalRevenue,
      totalIncome: totalIncomeCalculated,
      totalExpenses,
      pendingAmount: totalPendingRevenue,
      completedAmount: totalCompletedRevenue,
      totalSalesAmount: totalSalesAmount + completedCustomOrderRevenue, // Include custom orders in sales
      totalRentalsAmount,
      completedOutgoing: Math.round(completedOutgoing * 100) / 100,
      annualTurnover: Math.round(annualTurnover * 100) / 100,
      businessSize,
      taxBreakdown,
      monthlyTax,
      weeklyProjection,
      transactionBreakdown,
      profitMargin: parseFloat(profitMargin as string),
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      conversionMetrics,
    };

    console.log('[Finance API] Final Metrics Summary:', {
      totalIncome: totalIncomeCalculated,
      totalSalesAmount,
      totalRentalsAmount,
      completedOrders: completedOrders.length,
      salesRentalsData,
    });

    return NextResponse.json(
      { success: true, metrics },
      { status: 200 }
    );

    // Return with NO-CACHE headers to prevent stale data
    const response = NextResponse.json(
      { success: true, metrics },
      { status: 200 }
    );
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
    return response;
  } catch (error) {
    console.error('[FinanceAPI] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch finance metrics' },
      { status: 500 }
    );
  }
}

function calculateWeeklyProjection(
  orders: any[],
  year: number,
  month: number
): WeeklyData[] {
  const weeks: WeeklyData[] = [];
  const now = new Date();
  const currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - now.getDay());

  for (let i = 0; i < 4; i++) {
    const weekStart = new Date(currentWeekStart);
    weekStart.setDate(currentWeekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekOrders = orders.filter((order: any) => {
      const orderDate = new Date(order.createdAt);
      return orderDate >= weekStart && orderDate <= weekEnd;
    });

    const weekRevenue = weekOrders.reduce(
      (sum: number, order: any) => sum + (order.total || 0),
      0
    );

    const avgOrderValue =
      weekOrders.length > 0
        ? weekRevenue / weekOrders.length
        : 0;

    weeks.push({
      week: `Week ${i + 1} (${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()})`,
      revenue: Math.round(weekRevenue * 100) / 100,
      orders: weekOrders.length,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
    });
  }

  return weeks;
}

function calculateTransactionBreakdown(
  orders: any[],
  customOrders: any[]
): TransactionBreakdown {
  let salesCount = 0;
  let rentalsCount = 0;
  let returnsCount = 0;
  let refundsCount = 0;

  // Count transactions (not items) by type
  // A transaction can have both sales and rental items
  const transactionsWithSales = new Set<string>();
  const transactionsWithRentals = new Set<string>();

  orders.forEach((order: any) => {
    const orderId = order._id?.toString();
    
    if (order.items && Array.isArray(order.items)) {
      let hasSales = false;
      let hasRentals = false;

      order.items.forEach((item: any) => {
        if (item.mode === 'buy' || item.mode === 'sale') {
          hasSales = true;
        } else if (item.mode === 'rent' || item.mode === 'rental') {
          hasRentals = true;
        }
      });

      if (hasSales && orderId) {
        transactionsWithSales.add(orderId);
      }
      if (hasRentals && orderId) {
        transactionsWithRentals.add(orderId);
      }
    }
    
    // Count returns and refunds
    if (order.status === 'returned') {
      returnsCount++;
    }
    if (order.status === 'refunded') {
      refundsCount++;
    }
  });

  salesCount = transactionsWithSales.size;
  rentalsCount = transactionsWithRentals.size;

  console.log('[Finance] Transaction Breakdown:', {
    salesTransactions: salesCount,
    rentalTransactions: rentalsCount,
    customOrders: customOrders.length,
    returns: returnsCount,
    refunds: refundsCount,
  });

  return {
    sales: salesCount,
    rentals: rentalsCount,
    customOrders: customOrders.length,
    returns: returnsCount,
    refunds: refundsCount,
  };
}
