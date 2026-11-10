"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Eye, Package, Share2, MessageSquare, Mail, Download, Loader2, Save, ShoppingBag, Calendar } from "lucide-react";
import { generateProfessionalInvoiceHTML } from "@/lib/professionalInvoice";
import { StoredInvoice } from "@/lib/invoiceStorage";
import { useVatSettings } from "@/lib/hooks/useVatSettings";

interface InvoiceItem {
  id: string;
  name: string;
  quantity: number | "";
  price: number | "";
  productId?: string;
  imageUrl?: string;
  mode?: "buy" | "rent";
  sellPrice?: number;
  rentPrice?: number;
}

interface Product {
  _id: string;
  name: string;
  sellPrice: number;
  rentPrice?: number;
  imageUrl?: string;
}

const CURRENCIES = [
  { code: "NGN", symbol: "₦", name: "Nigerian Naira" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "EUR", symbol: "€", name: "Euro" },
];

interface ManualInvoiceGeneratorProps {
  invoiceToEdit?: any;
  onCancelEdit?: () => void;
}

export function ManualInvoiceGenerator({ invoiceToEdit, onCancelEdit }: ManualInvoiceGeneratorProps) {
  // Generate short invoice number
  const generateShortInvoiceNumber = () => {
    return `INV-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  };

  const [formData, setFormData] = useState({
    invoiceNumber: generateShortInvoiceNumber(),
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    orderNumber: "",
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    currency: "NGN",
    taxRate: null as number | null, // null = use the store VAT rate until the admin types one
    deliveryFee: 0,
    cautionFee: 0,
  });
  const storeVat = useVatSettings();
  const taxRate = formData.taxRate ?? storeVat.vatRate * 100;

  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [preview, setPreview] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [activeBank, setActiveBank] = useState<any>(null);

  useEffect(() => {
    fetch("/api/bank-details")
      .then(res => res.json())
      .then(data => {
        if (data.bank) setActiveBank(data.bank);
      })
      .catch(err => console.error("Error fetching active bank details in ManualInvoiceGenerator:", err));
  }, []);

  useEffect(() => {
    if (invoiceToEdit) {
      setFormData({
        invoiceNumber: invoiceToEdit.invoiceNumber,
        customerName: invoiceToEdit.customerName || "",
        customerEmail: invoiceToEdit.customerEmail || "",
        customerPhone: invoiceToEdit.customerPhone || "",
        orderNumber: invoiceToEdit.orderNumber || "",
        dueDate: invoiceToEdit.dueDate ? new Date(invoiceToEdit.dueDate).toISOString().split("T")[0] : "",
        currency: invoiceToEdit.currency || "NGN",
        taxRate: invoiceToEdit.taxRate ?? 7.5,
        deliveryFee: invoiceToEdit.shippingCost || 0,
        cautionFee: invoiceToEdit.cautionFee || 0,
      });

      setItems(
        (invoiceToEdit.items || []).map((item: any) => ({
          id: item.id || Math.random().toString(36).substring(2, 9),
          name: item.name || "",
          quantity: item.quantity !== undefined ? item.quantity : "",
          price: item.price !== undefined ? item.price : "",
          productId: item.productId,
          imageUrl: item.imageUrl,
        }))
      );
    }
  }, [invoiceToEdit]);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [selectedProductQuantity, setSelectedProductQuantity] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setProductsLoading(true);
    setProductsError("");
    try {
      // Use lite mode for faster loading (only essentials for product picker)
      const response = await fetch("/api/products?lite=1");
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data = await response.json();
      console.log("Loaded products:", data);
      const productList = Array.isArray(data) ? data : (data.data || data.products || []);
      setProducts(productList);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to load products";
      console.error("Failed to load products:", err);
      setProductsError(errorMsg);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  const addProductToInvoice = (product: Product, quantity: number = 1) => {
    setItems([
      ...items,
      {
        id: `prod-${product._id}-${Math.random()}`,
        name: product.name,
        quantity,
        price: product.sellPrice,
        productId: product._id,
        imageUrl: product.imageUrl,
        mode: "buy",
        sellPrice: product.sellPrice,
        rentPrice: product.rentPrice,
      },
    ]);
    setSelectedProductQuantity({});
  };

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(), name: "", quantity: "", price: "", mode: "buy" }]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleModeChange = (itemId: string, newMode: "buy" | "rent") => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        let updatedPrice = item.price;
        const product = products.find(p => p._id === item.productId);
        const sellPrice = item.sellPrice !== undefined ? item.sellPrice : product?.sellPrice;
        const rentPrice = item.rentPrice !== undefined ? item.rentPrice : product?.rentPrice;

        if (newMode === "buy" && sellPrice !== undefined) {
          updatedPrice = sellPrice;
        } else if (newMode === "rent" && rentPrice !== undefined) {
          updatedPrice = rentPrice;
        }
        return {
          ...item,
          mode: newMode,
          price: updatedPrice,
          sellPrice,
          rentPrice,
        };
      }
      return item;
    }));
  };

  const lineTotal = (item: InvoiceItem) => (Number(item.quantity) || 0) * (Number(item.price) || 0);
  // A line typed as "Caution fee" is a refundable deposit, not a sale: it is moved out of the
  // items and into the caution fee so it never attracts VAT.
  const isCautionItem = (item: InvoiceItem) => /caution/i.test(item.name);
  const productItems = items.filter(item => !isCautionItem(item));
  const cautionFee =
    (formData.cautionFee || 0) +
    items.filter(isCautionItem).reduce((sum, item) => sum + lineTotal(item), 0);
  const subtotal = productItems.reduce((sum, item) => sum + lineTotal(item), 0);
  // VAT on the products only - caution fee and delivery/logistics are never taxed
  const taxAmount = subtotal * (taxRate / 100);
  const totalAmount = subtotal + taxAmount + cautionFee + (formData.deliveryFee || 0);
  const currency = CURRENCIES.find(c => c.code === formData.currency)!;

  const handleShareAction = async (action: "whatsapp" | "download" | "email" | "save") => {
    if (!formData.customerName.trim()) {
      alert("Customer name is required");
      return;
    }
    if (items.length === 0) {
      alert("Add at least one item to the invoice");
      return;
    }

    setIsSaving(true);

    const isEditMode = !!invoiceToEdit;

    const invoice = {
      invoiceNumber: formData.invoiceNumber,
      customerName: formData.customerName,
      customerEmail: formData.customerEmail,
      customerPhone: formData.customerPhone,
      orderNumber: formData.orderNumber || (invoiceToEdit ? invoiceToEdit.orderNumber : `MAN-${Date.now()}`),
      invoiceDate: invoiceToEdit ? invoiceToEdit.invoiceDate : new Date().toISOString(),
      dueDate: formData.dueDate,
      currency: formData.currency,
      currencySymbol: currency.symbol,
      taxRate,
      type: 'manual',
      status: invoiceToEdit ? invoiceToEdit.status : 'sent',
      items: productItems.map(item => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        mode: item.mode || "buy",
      })),
      subtotal,
      taxAmount,
      cautionFee,
      shippingCost: formData.deliveryFee || 0,
      totalAmount,
    };

    try {
      const url = isEditMode ? `/api/invoices/${invoiceToEdit._id || invoiceToEdit.id}` : "/api/invoices";
      const method = isEditMode ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoice),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.details || errorData.error || "Failed to save invoice to database";
        throw new Error(errorMsg);
      }

      const data = await response.json();
      const savedInvoiceId = data.invoice?._id || data.invoice?.id;

      if (!savedInvoiceId) {
        throw new Error("API did not return a valid invoice ID");
      }

      const host = window.location.origin;
      const downloadUrl = `${host}/api/invoices/${savedInvoiceId}/download`;

      if (action === "whatsapp") {
        const text = `Hello ${formData.customerName},\n\nHere is your invoice *${formData.invoiceNumber}* from *EMPI Costumes*.\n\n*Total:* ${currency.symbol}${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}\n*Due Date:* ${formData.dueDate ? new Date(formData.dueDate).toLocaleDateString() : 'N/A'}\n\nYou can view and download it here: ${downloadUrl}\n\nThank you for your business!`;
        const cleanPhone = formData.customerPhone ? formData.customerPhone.replace(/[^0-9]/g, "") : "";
        
        let finalPhone = cleanPhone;
        if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
          finalPhone = "234" + cleanPhone.substring(1);
        } else if (cleanPhone.length > 0 && !cleanPhone.startsWith("234") && !cleanPhone.startsWith("+")) {
          finalPhone = "234" + cleanPhone;
        }

        const whatsappUrl = finalPhone 
          ? `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(text)}`
          : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        
        window.open(whatsappUrl, "_blank");
      } 
      else if (action === "email") {
        const subject = `Invoice ${formData.invoiceNumber} from EMPI Costumes`;
        const body = `Hello ${formData.customerName},\n\nHere is your invoice ${formData.invoiceNumber} from EMPI Costumes.\n\nTotal: ${currency.symbol}${totalAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}\nDue Date: ${formData.dueDate ? new Date(formData.dueDate).toLocaleDateString() : 'N/A'}\n\nYou can view and download the invoice here:\n${downloadUrl}\n\nThank you for your business!\n\nEMPI Costumes`;
        const mailtoUrl = `mailto:${formData.customerEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailtoUrl, "_blank");
      } 
      else if (action === "download") {
        const professionalHtml = generateProfessionalInvoiceHTML({
          ...invoice,
          id: savedInvoiceId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any, activeBank || undefined);
        
        const element = document.createElement("div");
        element.innerHTML = professionalHtml;
        
        const html2pdf = (await import("html2pdf.js")).default;
        const opt: any = {
          margin: 10,
          filename: `invoice-${formData.invoiceNumber}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        
        await html2pdf().from(element).set(opt).save();
      }

      setSuccessMessage(isEditMode ? `✅ Invoice ${formData.invoiceNumber} updated successfully!` : `✅ Invoice ${formData.invoiceNumber} saved successfully!`);
      setShowShareModal(false);

      if (isEditMode && onCancelEdit) {
        setTimeout(() => {
          onCancelEdit();
          setSuccessMessage("");
        }, 1500);
      } else {
        // Reset form
        setFormData({
          invoiceNumber: generateShortInvoiceNumber(),
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          orderNumber: "",
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          currency: "NGN",
          taxRate: null,
          deliveryFee: 0,
          cautionFee: 0,
        });
        setItems([]);
        setTimeout(() => setSuccessMessage(""), 4000);
      }
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to save and share invoice");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {invoiceToEdit ? `Edit Invoice ${formData.invoiceNumber}` : "Create Manual Invoice"}
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          {invoiceToEdit ? "Modify invoice details and save changes" : "Generate custom invoices to send to your clients"}
        </p>
      </div>

      {/* Success Message */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Section */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Customer Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                  placeholder="Customer name"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                  placeholder="customer@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                  placeholder="+234 800 000 0000"
                />
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Invoice Details</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Order Number</label>
                  <input
                    type="text"
                    value={formData.orderNumber}
                    onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Currency</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                  >
                    {CURRENCIES.map(c => (
                      <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Tax Rate (%)</label>
                  <input
                    type="number"
                    value={taxRate}
                    onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                    step="0.5"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Delivery / Logistics (no VAT)</label>
                  <input
                    type="number"
                    value={formData.deliveryFee || ""}
                    onChange={(e) => setFormData({ ...formData, deliveryFee: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Caution Fee (refundable, no VAT)</label>
                  <input
                    type="number"
                    value={formData.cautionFee || ""}
                    onChange={(e) => setFormData({ ...formData, cautionFee: Math.max(0, parseFloat(e.target.value) || 0) })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Invoice Items</h3>
            <div className="space-y-4">
              {items.length === 0 ? (
                <p className="text-gray-500 text-center py-6">No items added yet</p>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex gap-3 items-start border border-gray-200 rounded-lg p-3">
                      {item.imageUrl && (
                        <div className="flex-shrink-0">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-16 h-16 object-cover rounded"
                          />
                        </div>
                      )}
                      <div className="flex-1 space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Product Name</label>
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => updateItem(item.id, "name", e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 text-sm"
                            placeholder="Product name"
                          />
                        </div>
                        <div className="flex flex-wrap sm:flex-nowrap gap-3 items-end">
                          <div className="w-36 flex-shrink-0">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Type</label>
                            <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200">
                              <button
                                type="button"
                                onClick={() => handleModeChange(item.id, "buy")}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all duration-200 ${
                                  (item.mode || "buy") === "buy"
                                    ? "bg-white text-emerald-700 shadow-sm border border-gray-200"
                                    : "text-gray-500 hover:text-gray-900 border border-transparent"
                                }`}
                              >
                                <ShoppingBag className="h-3.5 w-3.5" />
                                Buy
                              </button>
                              <button
                                type="button"
                                onClick={() => handleModeChange(item.id, "rent")}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-xs font-bold transition-all duration-200 ${
                                  (item.mode || "buy") === "rent"
                                    ? "bg-white text-purple-700 shadow-sm border border-gray-200"
                                    : "text-gray-500 hover:text-gray-900 border border-transparent"
                                }`}
                              >
                                <Calendar className="h-3.5 w-3.5" />
                                Rent
                              </button>
                            </div>
                          </div>
                          <div className="w-20">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Qty</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, "quantity", e.target.value === "" ? "" : (parseInt(e.target.value) || 1))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 text-sm"
                              placeholder="1"
                              min="1"
                            />
                          </div>
                          <div className="w-24">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Price</label>
                            <input
                              type="number"
                              value={item.price}
                              onChange={(e) => updateItem(item.id, "price", e.target.value === "" ? "" : (parseFloat(e.target.value) || 0))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-500 text-sm"
                              placeholder="0"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div className="w-24 text-right mb-2">
                            <p className="text-xs text-gray-600 mb-1">{isCautionItem(item) ? "Caution (no VAT)" : "Total"}</p>
                            <p className="font-semibold text-gray-900">{currency.symbol}{((Number(item.quantity) || 0) * (Number(item.price) || 0)).toFixed(2)}</p>
                          </div>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="flex-shrink-0 bg-red-50 hover:bg-red-100 text-red-600 p-2 rounded-lg transition mb-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={addItem}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-lime-500 text-gray-600 hover:text-lime-600 px-4 py-2 rounded-lg font-semibold transition mt-4"
              >
                <Plus className="h-5 w-5" />
                Add Item
              </button>
              <button
                onClick={() => setShowProductPicker(true)}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-300 hover:border-blue-500 text-blue-600 hover:text-blue-700 px-4 py-2 rounded-lg font-semibold transition mt-2"
              >
                <Package className="h-5 w-5" />
                Add from Products
              </button>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        <div>
          {/* Summary Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sticky top-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Invoice Summary</h3>
            
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-semibold">{currency.symbol}{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Tax ({taxRate}%):</span>
                <span className="font-semibold">{currency.symbol}{taxAmount.toFixed(2)}</span>
              </div>
              {cautionFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Caution Fee (refundable, no VAT):</span>
                  <span className="font-semibold">{currency.symbol}{cautionFee.toFixed(2)}</span>
                </div>
              )}
              {formData.deliveryFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery / Logistics (no VAT):</span>
                  <span className="font-semibold">{currency.symbol}{formData.deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-3 flex justify-between">
                <span className="font-bold text-gray-900">Total:</span>
                <span className="text-lg font-bold text-lime-600">{currency.symbol}{totalAmount.toFixed(2)}</span>
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 border border-blue-200">
              <p className="font-semibold mb-2">Invoice Information:</p>
              <p><strong>Invoice #:</strong> {formData.invoiceNumber}</p>
              <p><strong>Customer:</strong> {formData.customerName || "—"}</p>
              <p><strong>Items:</strong> {items.length}</p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => setPreview(true)}
                disabled={items.length === 0}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition"
              >
                <Eye className="h-4 w-4" />
                Preview
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                disabled={items.length === 0 || !formData.customerName}
                className="w-full bg-lime-600 hover:bg-lime-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2"
              >
                <Share2 className="h-4 w-4" />
                {invoiceToEdit ? "Save & Share" : "Share"}
              </button>
              {invoiceToEdit && onCancelEdit && (
                <button
                  onClick={onCancelEdit}
                  className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2 border border-gray-300"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-2xl w-full my-8 max-h-[calc(100vh-100px)] flex flex-col">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Invoice Preview</h3>
              <button
                onClick={() => setPreview(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {/* Professional Invoice Preview */}
              <div dangerouslySetInnerHTML={{ 
                __html: generateProfessionalInvoiceHTML({
                  _id: '',
                  invoiceNumber: formData.invoiceNumber,
                  customerName: formData.customerName || 'Customer Name',
                  customerEmail: formData.customerEmail || 'customer@email.com',
                  customerPhone: formData.customerPhone || 'Phone',
                  orderNumber: formData.orderNumber || '',
                  items: productItems.map(item => ({
                    name: item.name,
                    quantity: Number(item.quantity) || 0,
                    price: Number(item.price) || 0,
                    mode: item.mode || "buy",
                  })),
                  subtotal,
                  taxAmount,
                  taxRate,
                  cautionFee,
                  totalAmount,
                  shippingCost: formData.deliveryFee || 0,
                  currency: formData.currency,
                  currencySymbol: currency.symbol,
                  invoiceDate: new Date().toISOString(),
                  dueDate: formData.dueDate,
                  notes: 'Thank you for your business!',
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                } as StoredInvoice, activeBank || undefined)
              }} className="w-full" />
            </div>
          </div>
        </div>
      )}

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg max-w-4xl w-full my-8">
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Add Products from Inventory</h3>
              <button
                onClick={() => setShowProductPicker(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {productsLoading ? (
              <div className="p-8 text-center text-gray-600">
                <div className="inline-block">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
                <p className="mt-3">Loading products...</p>
              </div>
            ) : productsError ? (
              <div className="p-8 text-center">
                <p className="text-red-600 mb-4">{productsError}</p>
                <button
                  onClick={loadProducts}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
                >
                  Retry
                </button>
              </div>
            ) : products.length === 0 ? (
              <div className="p-8 text-center text-gray-600">
                No products found
              </div>
            ) : (
              <div className="p-6 overflow-y-auto max-h-[calc(100vh-300px)]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {products.map((product) => (
                    <div
                      key={product._id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                    >
                      <div className="flex gap-4">
                        {product.imageUrl && (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            className="w-16 h-16 object-cover rounded"
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900 mb-1">{product.name}</h4>
                          <p className="text-sm text-gray-600 mb-3 flex flex-wrap gap-x-2 gap-y-1">
                            <span>Buy: <span className="font-bold text-lime-600">{currency.symbol}{product.sellPrice.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span></span>
                            {product.rentPrice !== undefined && (
                              <span>• Rent: <span className="font-bold text-purple-600">{currency.symbol}{product.rentPrice.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span></span>
                            )}
                          </p>
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min="1"
                              placeholder="Qty"
                              value={selectedProductQuantity[product._id] || 1}
                              onChange={(e) =>
                                setSelectedProductQuantity({
                                  ...selectedProductQuantity,
                                  [product._id]: parseInt(e.target.value) || 1,
                                })
                              }
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                            <button
                              onClick={() => {
                                const qty = selectedProductQuantity[product._id] || 1;
                                addProductToInvoice(product, qty);
                              }}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-semibold text-sm transition"
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
                  <button
                    onClick={() => setShowProductPicker(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scaleIn border border-gray-100 flex flex-col">
            <h3 className="text-xl font-bold mb-2 text-gray-900">Share Invoice</h3>
            <p className="text-sm text-gray-500 mb-6">
              Choose an action below. The invoice will be automatically saved to the database first.
            </p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleShareAction("whatsapp")}
                disabled={isSaving}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-lime-50 hover:border-lime-500 transition text-left text-gray-900 group"
              >
                <div className="p-2 rounded-lg bg-lime-100 text-lime-600 group-hover:bg-lime-200">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">Share on WhatsApp</p>
                  <p className="text-xs text-gray-400">Send direct download link to client chat</p>
                </div>
              </button>

              <button
                onClick={() => handleShareAction("download")}
                disabled={isSaving}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-blue-50 hover:border-blue-500 transition text-left text-gray-900 group"
              >
                <div className="p-2 rounded-lg bg-blue-100 text-blue-600 group-hover:bg-blue-200">
                  <Download className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">Download PDF</p>
                  <p className="text-xs text-gray-400">Save high-quality PDF locally</p>
                </div>
              </button>

              <button
                onClick={() => handleShareAction("email")}
                disabled={isSaving}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-purple-50 hover:border-purple-500 transition text-left text-gray-900 group"
              >
                <div className="p-2 rounded-lg bg-purple-100 text-purple-600 group-hover:bg-purple-200">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">Share via Email</p>
                  <p className="text-xs text-gray-400">Open client with pre-filled download link</p>
                </div>
              </button>

              <button
                onClick={() => handleShareAction("save")}
                disabled={isSaving}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 hover:border-gray-500 transition text-left text-gray-900 group"
              >
                <div className="p-2 rounded-lg bg-gray-100 text-gray-600 group-hover:bg-gray-200">
                  <Save className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">Save Only</p>
                  <p className="text-xs text-gray-400">Store in database without sending</p>
                </div>
              </button>
            </div>

            {isSaving && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-lime-600 font-semibold">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving and preparing...
              </div>
            )}

            <button
              onClick={() => setShowShareModal(false)}
              disabled={isSaving}
              className="mt-6 w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition text-sm disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
