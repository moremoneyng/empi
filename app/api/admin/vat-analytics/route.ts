import { requireAdmin } from '@/lib/adminAuth';
import { NextRequest, NextResponse } from 'next/server';
import Order from '@/lib/models/Order';
import Expense from '@/lib/models/Expense';
import VATHistory from '@/lib/models/VATHistory';
import connectDB from '@/lib/mongodb';
import { getCurrentMonthVAT } from '@/lib/utils/vatCalculations';

interface MonthlyVATData {
  month: string;
  monthIndex: number;
  year: number;
  salesExVAT: number;
  outputVAT: number;
  inputVAT: number;           // Real VAT from actual expenses
  vatPayable: number;
  orderCount: number;
  expenseCount: number;       // Count of expenses in month
  totalOrderAmount: number;
  totalExpenseAmount: number; // Total expense amount (ex VAT)
  daysRemaining?: number;
}

interface CurrentMonthVATData {
  month: number;
  year: number;
  currentMonthVAT: number;
  totalOutputVAT: number;
  totalInputVAT: number;
  annualVATTotal: number;
  vatRate: number;
  totalSalesAmount: number;
  deductibleExpensesAmount: number;
  status: string;
}

interface VATAnalyticsResponse {
  monthlyBreakdown: MonthlyVATData[];
  currentMonthVAT: CurrentMonthVATData | null;
  annualVATTotal: number;
  averageMonthlyVAT: number;
  totalInputVATAvailable: number;  // Real, actual Input VAT
}

export async function GET(request: NextRequest) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  try {
    await connectDB();

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Get current month VAT from new system
    const currentMonthVATData = await getCurrentMonthVAT();

    // Fetch all orders AND all expenses for historical breakdown
    const allOrders = await Order.find({}).lean();
    const allExpenses = await Expense.find({}).lean();

    // Calculate monthly breakdown for visualization
    const monthlyVATData: MonthlyVATData[] = [];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(currentYear, month, 1);
      const monthEnd = new Date(currentYear, month + 1, 0);

      // Get orders for this month
      const monthOrders = allOrders.filter((order: any) => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= monthStart && orderDate <= monthEnd;
      });

      // Get expenses for this month (REAL DATA - only verified/paid expenses)
      const monthExpenses = allExpenses.filter((expense: any) => {
        const expenseDate = new Date(expense.createdAt);
        return (
          expenseDate >= monthStart &&
          expenseDate <= monthEnd &&
          (expense.status === 'verified' || expense.status === 'paid')
        );
      });

      // Calculate totals for orders
      const totalOrderAmount = monthOrders.reduce(
        (sum: number, order: any) => sum + (order.subtotal || 0),
        0
      );

      const totalVATCollected = monthOrders.reduce(
        (sum: number, order: any) => sum + (order.vat || 0),
        0
      );

      // Calculate REAL Input VAT from actual expenses
      const totalInputVAT = monthExpenses.reduce(
        (sum: number, expense: any) => sum + (expense.vat || 0),
        0
      );

      const totalExpenseAmount = monthExpenses.reduce(
        (sum: number, expense: any) => sum + (expense.amount || 0),
        0
      );

      // VAT Calculation
      const VAT_RATE = 0.075; // 7.5%
      const salesExVAT = totalOrderAmount; // Subtotal is already VAT-exclusive
      const outputVAT = totalVATCollected; // Actual VAT collected from orders
      const inputVAT = totalInputVAT; // REAL VAT from actual supplier expenses (NOT estimated)
      const vatPayable = Math.max(0, outputVAT - inputVAT);

      monthlyVATData.push({
        month: monthNames[month],
        monthIndex: month,
        year: currentYear,
        salesExVAT: Math.round(salesExVAT * 100) / 100,
        outputVAT: Math.round(outputVAT * 100) / 100,
        inputVAT: Math.round(inputVAT * 100) / 100,
        vatPayable: Math.round(vatPayable * 100) / 100,
        orderCount: monthOrders.length,
        expenseCount: monthExpenses.length,
        totalOrderAmount: Math.round(totalOrderAmount * 100) / 100,
        totalExpenseAmount: Math.round(totalExpenseAmount * 100) / 100,
      });
    }

    // Current month data - now using new system
    const currentMonthForResponse: CurrentMonthVATData | null = currentMonthVATData
      ? {
          month: currentMonthVATData.month,
          year: currentMonthVATData.year,
          currentMonthVAT: currentMonthVATData.currentMonthVAT,
          totalOutputVAT: currentMonthVATData.totalOutputVAT,
          totalInputVAT: currentMonthVATData.totalInputVAT,
          annualVATTotal: currentMonthVATData.annualVATTotal,
          vatRate: currentMonthVATData.vatRate,
          totalSalesAmount: currentMonthVATData.totalSalesAmount,
          deductibleExpensesAmount: currentMonthVATData.deductibleExpensesAmount,
          status: currentMonthVATData.status,
        }
      : null;

    // Calculate annual totals
    const annualVATTotal = monthlyVATData.reduce(
      (sum, data) => sum + data.vatPayable,
      0
    );

    const totalInputVATAvailable = monthlyVATData.reduce(
      (sum, data) => sum + data.inputVAT,
      0
    );

    const averageMonthlyVAT = monthlyVATData.length > 0
      ? annualVATTotal / monthlyVATData.length
      : 0;

    const response: VATAnalyticsResponse = {
      monthlyBreakdown: monthlyVATData,
      currentMonthVAT: currentMonthForResponse,
      annualVATTotal: currentMonthVATData?.annualVATTotal || Math.round(annualVATTotal * 100) / 100,
      averageMonthlyVAT: Math.round(averageMonthlyVAT * 100) / 100,
      totalInputVATAvailable: currentMonthVATData?.totalInputVAT || Math.round(totalInputVATAvailable * 100) / 100,
    };

    return NextResponse.json(
      { success: true, data: response },
      { status: 200 }
    );
  } catch (error) {
    console.error('[VAT Analytics API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch VAT analytics' },
      { status: 500 }
    );
  }
}
