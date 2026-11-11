"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Upload, X, CheckCircle2, Bell, Clock, Zap, Plus, Check } from "lucide-react";
import { ProductVideoManager } from "./components/ProductVideoManager";
import { RentLimitField } from "./components/RentLimitField";

export interface NestedSizeEntry {
  size: string;
  displayForSale: boolean;
  displayForRent: boolean;
}

export interface VariantGroup {
  colorName: string;
  colorHex?: string;
  sizes: NestedSizeEntry[];
}

const colorDictionary: Record<string, string> = {
  burgundy: "#800020",
  emerald: "#50c878",
  ruby: "#e0115f",
  sapphire: "#0f52ba",
  rose: "#ff007f",
  mint: "#3eb489",
  mustard: "#e1ad01",
  wine: "#722f37",
  champagne: "#f7e7ce",
  cream: "#fffdd0",
  apricot: "#fbceb1",
  mauve: "#e0b0ff",
  amber: "#ffbf00",
  bronze: "#cd7f32",
  copper: "#b87333",
  brass: "#b5a642",
  rust: "#b7410e",
  "rose gold": "#b76e79",
  "rosegold": "#b76e79",
  "emerald green": "#50c878",
  "royal blue": "#4169e1",
  "sky blue": "#87ceeb",
  "navy blue": "#000080",
  "forest green": "#228b22",
  "hot pink": "#ff69b4",
  "dark red": "#8b0000",
  "light blue": "#add8e6",
};

export function getVariantColorStyle(name: string): React.CSSProperties {
  const normalized = name.trim().toLowerCase();
  
  if (colorDictionary[normalized]) {
    return { backgroundColor: colorDictionary[normalized] };
  }
  
  if (typeof window !== 'undefined' && CSS.supports('color', normalized)) {
    return { backgroundColor: normalized };
  }
  
  const charCode = normalized.charCodeAt(0) || 0;
  const hue = (charCode * 7) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue}, 70%, 60%), hsl(${(hue + 40) % 360}, 70%, 45%))`,
    color: '#ffffff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '0.75rem',
  };
}

interface ProductForm {
  name: string;
  description: string;
  sellPrice: string;
  rentPrice: string;
  category: "adults" | "kids";
  costumeType: string;
  country?: string; // For Traditional Africa subfilter
  badge: string;
  variants: VariantGroup[];
  material: string;
  condition: string;
  careInstructions: string;
  availableForBuy: boolean;
  availableForRent: boolean;
  isCostumeShow?: boolean;
  maxRentQuantity?: number | null;
  imageFiles: File[];
  imagePreviews: string[];
  videoUrls: string[]; // already uploaded to Cloudinary
}

interface FormErrors {
  name?: string;
  description?: string;
  sellPrice?: string;
  rentPrice?: string;
  variants?: string;
  material?: string;
  careInstructions?: string;
  images?: string;
}

export default function MobileAdminUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPriceOptional, setIsPriceOptional] = useState(false);

  // Fetch settings to check if product prices are optional
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/admin/homepage-settings");
        if (res.ok) {
          const data = await res.json();
          setIsPriceOptional(data.isPriceOptional || false);
        }
      } catch (err) {
        console.error("Error fetching homepage settings:", err);
      }
    };
    fetchSettings();
  }, []);

  const [form, setForm] = useState<ProductForm>({
    name: "",
    description: "",
    sellPrice: "",
    rentPrice: "",
    category: "adults",
    costumeType: "Other",
    country: "",
    badge: "",
    variants: [],
    material: "",
    condition: "",
    careInstructions: "",
    availableForBuy: true,
    availableForRent: true,
    isCostumeShow: false,
    maxRentQuantity: null,
    imageFiles: [],
    imagePreviews: [],
    videoUrls: [],
  });
  const [videosUploading, setVideosUploading] = useState(false);
  const hasMedia = form.imagePreviews.length > 0 || form.videoUrls.length > 0;

  // Modal States for Dynamic Variants (Unified Color Group Modal)
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);

  // Local state for the modal inputs
  const [modalColorName, setModalColorName] = useState("");
  const [modalSizes, setModalSizes] = useState<NestedSizeEntry[]>([]);
  const [modalNewSizeName, setModalNewSizeName] = useState("");
  const [modalNewSizeDisplayForSale, setModalNewSizeDisplayForSale] = useState(true);
  const [modalNewSizeDisplayForRent, setModalNewSizeDisplayForRent] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showNotification, setShowNotification] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [uploadedProductName, setUploadedProductName] = useState("");

  const compressImage = async (base64: string, mimeType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const img = new (window as any).Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Calculate new dimensions maintaining aspect ratio
            const maxWidth = 1920;
            const maxHeight = 1920;

            if (width > height) {
              if (width > maxWidth) {
                height = Math.round((height * maxWidth) / width);
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = Math.round((width * maxHeight) / height);
                height = maxHeight;
              }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              throw new Error('Could not get canvas context');
            }

            ctx.drawImage(img, 0, 0, width, height);

            // Compress with progressively lower quality until it's under 1MB
            let quality = 0.9;
            let compressedBase64 = '';

            while (quality > 0.1) {
              compressedBase64 = canvas.toDataURL(mimeType, quality);
              
              // Check if compressed size is under 1MB
              if ((compressedBase64.length * 0.75) / 1024 / 1024 < 1) {
                break;
              }
              
              quality -= 0.1;
            }

            console.log(`✅ Image compressed: ${(base64.length / 1024 / 1024).toFixed(2)}MB → ${(compressedBase64.length / 1024 / 1024).toFixed(2)}MB`);
            resolve(compressedBase64);
          } catch (err) {
            reject(err);
          }
        };

        img.onerror = () => {
          reject(new Error('Failed to load image'));
        };

        img.src = base64;
      } catch (err) {
        reject(err);
      }
    });
  };

  const filesToBase64 = async (files: File[]) => {
    const results: string[] = [];
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        totalSize += file.size;

        if (!file.type.startsWith("image/")) {
          const error = new Error(`File ${i + 1} is not a valid image`);
          console.error(error);
          throw error;
        }

        setUploadProgress(`Processing ${i + 1}/${files.length}...`);

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => {
            reject(new Error("Failed to read file"));
          };
          reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string") {
              reject(new Error("Invalid file read result"));
              return;
            }
            if (!result.startsWith("data:")) {
              reject(new Error("Invalid image data format"));
              return;
            }
            resolve(result);
          };
          reader.readAsDataURL(file);
        });

        let finalBase64 = base64;
        if (file.size > 500 * 1024) { // Compress if larger than 500KB
          setUploadProgress(`Compressing ${i + 1}/${files.length}...`);
          finalBase64 = await compressImage(base64, file.type);
        }

        results.push(finalBase64);
      } catch (err) {
        console.error(`Error processing image ${i + 1}:`, err);
        throw err;
      }
    }

    setUploadProgress("");
    if (results.length > 0) {
      console.log(`Successfully processed ${results.length} images`);
    }
    return results;
  };

  const handleBulkImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    const maxSlots = 5;
    const currentCount = form.imageFiles.length;
    const availableSlots = maxSlots - currentCount;

    if (availableSlots <= 0) {
      setSubmitMessage("❌ Maximum 5 images limit reached");
      return;
    }

    const insertFiles = files.slice(0, Math.min(files.length, availableSlots));

    try {
      setUploadProgress(`Loading ${insertFiles.length} image${insertFiles.length > 1 ? "s" : ""}...`);
      const base64s = await filesToBase64(insertFiles);

      setForm((prev) => {
        const newFiles = [...prev.imageFiles];
        const newPreviews = [...prev.imagePreviews];

        for (let i = 0; i < base64s.length; i++) {
          if (newFiles.length < maxSlots) {
            newFiles.push(insertFiles[i]);
            newPreviews.push(base64s[i]);
          }
        }

        return {
          ...prev,
          imageFiles: newFiles,
          imagePreviews: newPreviews,
        };
      });

      if (files.length > availableSlots) {
        setSubmitMessage(`⚠️ Only ${availableSlots} image${availableSlots === 1 ? "" : "s"} added (limit is 5 total)`);
        setTimeout(() => setSubmitMessage(""), 3000);
      }

      setUploadProgress("");
    } catch (err) {
      console.error("Error reading images:", err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setSubmitMessage(`❌ Error: ${errorMsg}`);
      setUploadProgress("");
    } finally {
      try {
        e.currentTarget.value = "";
      } catch (e) {
        // ignore
      }
    }
  };

  const removeImage = (index: number) => {
    setForm((prev) => {
      const newFiles = prev.imageFiles.filter((_, i) => i !== index);
      const newPreviews = prev.imagePreviews.filter((_, i) => i !== index);
      return { ...prev, imageFiles: newFiles, imagePreviews: newPreviews };
    });
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const hasRequiredPrice = isPriceOptional || (form.sellPrice && form.rentPrice);

    if (
      !form.name ||
      !form.description ||
      !hasRequiredPrice ||
      form.variants.length === 0 ||
      !hasMedia
    ) {
      setSubmitMessage("❌ Fill all required fields and add at least 1 image or video");
      return;
    }

    if (videosUploading) {
      setSubmitMessage("⏳ Please wait for your videos to finish uploading");
      return;
    }

    setIsSubmitting(true);
    setSubmitMessage("");
    setUploadProgress(form.imagePreviews.length > 0 ? "Uploading images..." : "Saving product...");

    try {
      console.log(`📤 Uploading ${form.imagePreviews.length} images...`);
      const cloudinaryUrls: string[] = [];

      for (let i = 0; i < form.imagePreviews.length; i++) {
        setUploadProgress(`Image ${i + 1}/${form.imagePreviews.length}...`);

        try {
          const uploadController = new AbortController();
          const uploadTimeoutId = setTimeout(() => uploadController.abort(), 120000);

          const uploadResponse = await fetch("/api/cloudinary/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageData: form.imagePreviews[i],
              fileName: form.imageFiles[i]?.name || `image-${i + 1}`,
            }),
            signal: uploadController.signal,
          });

          clearTimeout(uploadTimeoutId);

          if (!uploadResponse.ok) {
            const error = await uploadResponse.json();
            throw new Error(`Image ${i + 1}: ${error.error || error.details}`);
          }

          const uploadData = await uploadResponse.json();
          if (!uploadData.url) {
            throw new Error(`No URL for image ${i + 1}`);
          }

          cloudinaryUrls.push(uploadData.url);
          console.log(`✅ Image ${i + 1} uploaded`);
        } catch (uploadError) {
          const errorMsg = uploadError instanceof Error ? uploadError.message : "Unknown error";
          console.error(`❌ Error uploading image ${i + 1}:`, errorMsg);
          throw uploadError;
        }
      }

      // Video-only products: the server uses the first video's poster frame as the main image
      const mainImage = cloudinaryUrls[0];

      const payload = {
        name: form.name,
        description: form.description,
        sellPrice: form.sellPrice ? parseFloat(form.sellPrice) : undefined,
        rentPrice: form.rentPrice ? parseFloat(form.rentPrice) : undefined,
        category: form.category,
        costumeType: form.costumeType,
        ...(form.country && { country: form.country }),
        badge: form.badge || null,
        imageUrl: mainImage,
        imageUrls: cloudinaryUrls,
        videoUrls: form.videoUrls,
        variants: form.variants,
        material: form.material,
        condition: form.condition,
        careInstructions: form.careInstructions,
        availableForBuy: form.availableForBuy,
        availableForRent: form.availableForRent,
        isCostumeShow: form.isCostumeShow || false,
        maxRentQuantity: form.isCostumeShow ? null : form.maxRentQuantity ?? null,
      };

      console.log("📤 Creating product...");
      setUploadProgress("Creating product...");

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error("❌ Response Status:", response.status, response.statusText);
        console.error("❌ Response Headers:", Object.fromEntries(response.headers.entries()));
        
        let error: any = {};
        try {
          const responseText = await response.text();
          console.error("❌ Raw Response:", responseText);
          error = responseText ? JSON.parse(responseText) : {};
        } catch (parseError) {
          console.error("❌ Failed to parse error response:", parseError);
        }
        
        console.error("❌ Parsed Error:", error);
        setSubmitMessage(`❌ Error: ${error.error || error.message || 'Unknown error'}`);
        setUploadProgress("");
        return;
      }

      const data = await response.json();
      console.log("✅ Product created:", data);
      setUploadProgress("Clearing cache...");

      try {
        ["all", "adults", "kids"].forEach((cat) => {
          localStorage.removeItem(`products_${cat}`);
          localStorage.removeItem(`products_${cat}_time`);
        });
      } catch (e) {
        // ignore
      }

      try {
        const bc = new BroadcastChannel("empi-products");
        bc.postMessage("products-updated");
        bc.close();
      } catch (e) {
        // ignore
      }

      try {
        localStorage.setItem("empi-products-updated", Date.now().toString());
      } catch (e) {
        // ignore
      }

      // Show success notification
      setUploadedProductName(form.name);
      setNotificationTitle("🎉 Success!");
      setNotificationMessage(`"${form.name}" has been uploaded successfully and is now live on the store.`);
      setShowNotification(true);

      setForm({
        name: "",
        description: "",
        sellPrice: "",
        rentPrice: "",
        category: "adults",
        costumeType: "Other",
        country: "",
        badge: "",
        variants: [],
        material: "",
        condition: "new",
        careInstructions: "",
        availableForBuy: true,
        availableForRent: true,
        isCostumeShow: false,
        maxRentQuantity: null,
        imageFiles: [],
        imagePreviews: [],
        videoUrls: [],
      });

      setSubmitMessage("✅ Product uploaded successfully!");
      setUploadProgress("");
      setTimeout(() => setSubmitMessage(""), 5000);
    } catch (error) {
      console.error("❌ Submission error:", error);

      if (error instanceof Error && error.name === "AbortError") {
        setSubmitMessage("❌ Upload timeout. Check your connection.");
      } else {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        setSubmitMessage(`❌ Error: ${errorMsg}`);
      }
      setUploadProgress("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white pb-20 px-0">
      
      {/* Success Notification Modal */}
      {showNotification && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in scale-95 zoom-in duration-300">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-green-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
                <div className="relative bg-gradient-to-br from-green-400 to-green-600 rounded-full p-4">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">{notificationTitle}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{notificationMessage}</p>
            </div>

            {/* Product Details Card */}
            <div className="bg-gradient-to-r from-lime-50 to-green-50 rounded-lg p-4 border border-lime-200">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-lime-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-600 font-medium">UPLOADED PRODUCT</p>
                  <p className="text-sm font-semibold text-gray-900 truncate">{uploadedProductName}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-4">
              <button
                onClick={() => setShowNotification(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-900 font-semibold rounded-lg transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowNotification(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="px-4 py-2 bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-700 hover:to-green-700 text-white font-semibold rounded-lg transition"
              >
                Upload More
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      {submitMessage && (
        <div
          className={`sticky top-16 mx-4 mt-4 p-4 rounded-xl text-center font-semibold text-sm ${
            submitMessage.includes("✅")
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {submitMessage}
        </div>
      )}

      {uploadProgress && (
        <div className="sticky top-24 mx-4 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-xs font-semibold text-center">
          {uploadProgress}
        </div>
      )}

      {/* Combined Upload Form - Single Scrollable View */}
      <form onSubmit={handleSubmit} className="space-y-6 px-4 py-6 pb-28">
        {/* SECTION 1: Images Upload */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">📸</span>
            Upload Photos &amp; Videos
          </h3>
          <p className="text-xs text-gray-500 -mt-2">Add photos, videos, or both &mdash; at least one is required.</p>

          {/* Image Upload Area */}
          <div>
            <label
              onClick={() => {
                if (fileInputRef.current && !isSubmitting && form.imagePreviews.length < 5) {
                  fileInputRef.current.click();
                }
              }}
              className="flex flex-col items-center justify-center w-full p-8 bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-2xl cursor-pointer hover:bg-gradient-to-br hover:from-lime-50 hover:to-green-50 hover:border-lime-400 transition"
            >
              <div className="bg-lime-100 rounded-full p-3 mb-3">
                <Upload className="h-6 w-6 text-lime-600" />
              </div>
              <p className="font-bold text-gray-900 text-lg">Upload Photos</p>
              <p className="text-xs text-gray-600 mt-1">
                {form.imagePreviews.length >= 5
                  ? "Maximum 5 images reached"
                  : `Tap to select images (${5 - form.imagePreviews.length} remaining)`}
              </p>
            </label>
            <input
              ref={fileInputRef}
              id="image-input"
              type="file"
              multiple
              accept="image/*"
              onChange={handleBulkImageChange}
              style={{ display: "none" }}
            />
          </div>

          {/* Image Previews - Thumbnail Grid */}
          {form.imagePreviews.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900 text-sm">Uploaded Thumbnails</p>
                <span className="text-xs bg-lime-100 text-lime-700 px-3 py-1 rounded-full font-semibold">{form.imagePreviews.length}/5</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {form.imagePreviews.map((preview, index) => (
                  <div
                    key={index}
                    className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border-2 border-gray-200 hover:border-lime-400 transition"
                  >
                    <Image
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      fill
                      className="object-cover group-hover:scale-105 transition duration-300"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center"
                    >
                      <X className="h-5 w-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Videos */}
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">🎬</span>
            Product Videos
          </h3>
          <ProductVideoManager
            videoUrls={form.videoUrls}
            onChange={(update) => setForm((prev) => ({ ...prev, videoUrls: update(prev.videoUrls) }))}
            onUploadingChange={setVideosUploading}
            disabled={isSubmitting}
          />
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200"></div>

        {/* SECTION 2: Product Details */}
        <div className="space-y-5">
          <div className="bg-gradient-to-r from-lime-50 to-green-50 rounded-lg p-4 border border-lime-200">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <span className="text-lg">📋</span>
              Product Details
            </h3>
            <p className="text-xs text-gray-600 mt-1">Fill in all required information for your product</p>
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Product Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleInputChange}
              placeholder="e.g., Vintage Red Dress"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
              disabled={isSubmitting}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleInputChange}
              placeholder="Describe the product, condition, materials..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm resize-none bg-white transition hover:border-gray-400"
              disabled={isSubmitting}
            />
          </div>

          {/* Prices */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-lg">💰</span>
              Pricing
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Sell Price (₦) {isPriceOptional ? <span className="text-gray-400 font-normal">(Optional)</span> : <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  name="sellPrice"
                  value={form.sellPrice}
                  onChange={handleInputChange}
                  placeholder="50000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Rent Price (₦) {isPriceOptional ? <span className="text-gray-400 font-normal">(Optional)</span> : <span className="text-red-500">*</span>}
                </label>
                <input
                  type="number"
                  name="rentPrice"
                  value={form.rentPrice}
                  onChange={handleInputChange}
                  placeholder="5000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          {/* Category & Type */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-lg">🎭</span>
              Category & Type
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="category"
                  value={form.category}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                  disabled={isSubmitting}
                >
                  <option value="adults">👔 Adults</option>
                  <option value="kids">👶 Kids</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">
                  Costume Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="costumeType"
                  value={form.costumeType}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                  disabled={isSubmitting}
                >
                  <option value="Angel">👼 Angel</option>
                  <option value="Carnival">🎪 Carnival</option>
                  <option value="Western">🤠 Western</option>
                  <option value="Traditional Africa">🥁 Traditional Africa</option>
                  <option value="Cosplay">🎭 Cosplay</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              
              {/* Country field - Only show if Traditional Africa is selected */}
              {form.costumeType === "Traditional Africa" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="country"
                    value={form.country || ""}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                    disabled={isSubmitting}
                  >
                    <option value="">Select a country...</option>
                    <option value="Nigeria">Nigeria</option>
                    <option value="Ghana">Ghana</option>
                    <option value="South Africa">South Africa</option>
                    <option value="Egypt">Egypt</option>
                    <option value="Algeria">Algeria</option>
                    <option value="Congo">Congo</option>
                    <option value="Kenya">Kenya</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Attributes Section */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-lg">👕</span>
              Product Variants
            </h4>
            
            <div className="space-y-6">
              {/* Variant Group Builder */}
              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <label className="block text-sm font-bold text-gray-900 mb-4">
                  Variant Groups (Colors & Sizes) <span className="text-red-500">*</span>
                </label>
                
                {/* Action to open Add Color Modal */}
                <div className="flex justify-center mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingColorIndex(null);
                      setModalColorName("");
                      setModalSizes([]);
                      setModalNewSizeName("");
                      setModalNewSizeDisplayForSale(true);
                      setModalNewSizeDisplayForRent(true);
                      setIsColorModalOpen(true);
                    }}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gray-900 to-black text-white rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition transform hover:-translate-y-0.5 active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Add Color Group
                  </button>
                </div>

                {/* Variant List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {form.variants.map((variant, vIdx) => (
                    <div key={vIdx} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm transition hover:border-gray-300 flex flex-col justify-between">
                      {/* Color Header */}
                      <div className="bg-gray-50/50 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-5.5 h-5.5 rounded-full shadow-inner border border-gray-200 flex-shrink-0" 
                            style={getVariantColorStyle(variant.colorName)}
                          >
                            {getVariantColorStyle(variant.colorName).display === 'flex' && (
                              <span className="text-white text-[9px] font-black uppercase">
                                {variant.colorName.trim().charAt(0)}
                              </span>
                            )}
                          </div>
                          <span className="font-extrabold text-gray-900 text-xs tracking-wide">{variant.colorName}</span>
                          <span className="text-[9px] font-bold bg-gray-200/50 text-gray-600 px-1.5 py-0.5 rounded">{variant.sizes.length} sizes</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingColorIndex(vIdx);
                              setModalColorName(variant.colorName);
                              setModalSizes(variant.sizes || []);
                              setModalNewSizeName("");
                              setModalNewSizeDisplayForSale(true);
                              setModalNewSizeDisplayForRent(true);
                              setIsColorModalOpen(true);
                            }}
                            className="text-[10px] font-black text-lime-600 hover:bg-lime-50 px-2 py-1.5 rounded transition uppercase tracking-wider"
                          >
                            Edit
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              const newVariants = [...form.variants];
                              newVariants.splice(vIdx, 1);
                              setForm(prev => ({ ...prev, variants: newVariants }));
                            }}
                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Sizes Content */}
                      <div className="p-3 bg-white flex-1 flex items-center">
                        {variant.sizes && variant.sizes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 w-full">
                            {variant.sizes.map((sz, sIdx) => {
                              const badgeStr = `${sz.displayForSale ? 'S' : ''}${sz.displayForSale && sz.displayForRent ? '/' : ''}${sz.displayForRent ? 'R' : ''}`;
                              return (
                                <div key={sIdx} className="flex items-center gap-1 bg-gray-50 border border-gray-150 rounded px-2 py-1 text-[10px] font-bold text-gray-800">
                                  <span>{sz.size}</span>
                                  {badgeStr && <span className="text-[8px] font-black text-gray-400">({badgeStr})</span>}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 italic">No sizes configured. Click Edit to add sizes.</p>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {form.variants.length === 0 && (
                    <div className="text-center py-8 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl w-full col-span-full">
                      <p className="text-sm font-bold text-gray-500 mb-1">No variants added yet.</p>
                      <p className="text-xs text-gray-400">Add a color group to start building sizes.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Material and Condition */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Material <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <input
                    type="text"
                    name="material"
                    value={form.material}
                    onChange={handleInputChange}
                    placeholder="Cotton, Silk..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
                    Condition <span className="text-gray-400 font-normal lowercase">(optional)</span>
                  </label>
                  <select
                    name="condition"
                    value={form.condition}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
                    disabled={isSubmitting}
                  >
                    <option value="">Select Condition (Optional)</option>
                    <option value="new">✨ New</option>
                    <option value="like-new">⭐ Like New</option>
                    <option value="good">👍 Good</option>
                    <option value="fair">🔧 Fair</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Care Instructions */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Care Instructions <span className="text-gray-400 font-normal text-xs lowercase">(optional)</span>
            </label>
            <textarea
              name="careInstructions"
              value={form.careInstructions}
              onChange={handleInputChange}
              placeholder="Dry clean only, hand wash..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm resize-none bg-white transition hover:border-gray-400"
              disabled={isSubmitting}
            />
          </div>

          {/* Badge (Optional) */}
          <div>
            <label className="block text-sm font-bold text-gray-900 mb-2">
              Badge <span className="text-xs text-gray-500">(Optional)</span>
            </label>
            <input
              type="text"
              name="badge"
              value={form.badge}
              onChange={handleInputChange}
              placeholder="New, Sale, Premium..."
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-lime-500 focus:border-transparent text-sm placeholder-gray-500 transition hover:border-gray-400 !text-black !bg-white"
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 mt-1">Optional badge to highlight this product on the store</p>
          </div>

          {/* Availability Options */}
          <div>
            <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-lg">📦</span>
              Availability
            </h4>
            <div className="space-y-3">
              {/* Available for Buy */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-lime-300 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={form.availableForBuy}
                  onChange={(e) =>
                    setForm({ ...form, availableForBuy: e.target.checked })
                  }
                  disabled={isSubmitting}
                  className="w-5 h-5 accent-lime-600 cursor-pointer rounded"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">🛒 Available for Purchase</p>
                  <p className="text-xs text-gray-500">Customers can buy this product</p>
                </div>
              </label>

              {/* Available for Rent */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-lime-300 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={form.availableForRent}
                  onChange={(e) =>
                    setForm({ ...form, availableForRent: e.target.checked })
                  }
                  disabled={isSubmitting}
                  className="w-5 h-5 accent-lime-600 cursor-pointer rounded"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">🎪 Available for Rental</p>
                  <p className="text-xs text-gray-500">Customers can rent this product</p>
                </div>
              </label>

              {/* Costume Show Flag */}
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-lime-300 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={form.isCostumeShow || false}
                  onChange={(e) =>
                    setForm({ ...form, isCostumeShow: e.target.checked })
                  }
                  disabled={isSubmitting}
                  className="w-5 h-5 accent-lime-600 cursor-pointer rounded"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">✨ Featured in THE COSTUME SHOW 2026</p>
                  <p className="text-xs text-gray-500">Show this product in the Costume Show special collection</p>
                </div>
              </label>

              <RentLimitField
                value={form.maxRentQuantity}
                onChange={(v) => setForm({ ...form, maxRentQuantity: v })}
                isCostumeShow={form.isCostumeShow || false}
                availableForRent={form.availableForRent}
              />

              {!form.availableForBuy && !form.availableForRent && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 font-semibold">⚠️ Warning: Product not available for anything. Check at least one option above.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-white via-white to-transparent p-4 border-t border-gray-200 z-40">
          <button
            type="submit"
            disabled={isSubmitting || !hasMedia || videosUploading}
            className={`w-full py-4 px-6 font-bold rounded-xl text-white transition text-lg shadow-lg hover:shadow-xl ${
              isSubmitting || !hasMedia || videosUploading
                ? "bg-gradient-to-r from-gray-400 to-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-lime-600 to-green-600 hover:from-lime-700 hover:to-green-700 active:scale-95"
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              {isSubmitting ? (
                <>
                  <span className="inline-block animate-spin">⏳</span>
                  Uploading...
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  Upload Product
                </>
              )}
            </span>
          </button>
          {!hasMedia && (
            <p className="text-xs text-gray-500 text-center mt-2">📸 Add photos or a video to upload</p>
          )}
          {videosUploading && (
            <p className="text-xs text-gray-500 text-center mt-2">🎬 Waiting for videos to finish uploading…</p>
          )}
        </div>
      </form>

      {/* Modals placed outside of form so their buttons don't accidentally submit */}
      {/* Unified Color & Sizes Group Modal */}
      {isColorModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 transform transition-all overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black text-gray-900 tracking-tight">
                  {editingColorIndex !== null ? 'Edit Color Group' : 'Add Color Group'}
                </h3>
                <p className="text-xs font-bold text-lime-600 uppercase tracking-wider mt-1">
                  Configure color & sizes variant
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsColorModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Color Name Section */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">Color Name</label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={modalColorName}
                    onChange={(e) => setModalColorName(e.target.value)}
                    placeholder="e.g. Midnight Blue, Crimson"
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-gray-900 text-sm font-semibold transition bg-gray-50 focus:bg-white !text-black !bg-white"
                  />
                  {modalColorName.trim() && (
                    <div 
                      className="w-12 h-12 rounded-xl shadow-inner border border-gray-200 flex-shrink-0 transition-all duration-300"
                      style={getVariantColorStyle(modalColorName)}
                    >
                      {getVariantColorStyle(modalColorName).display === 'flex' && (
                        <span className="text-white text-xs font-black uppercase">
                          {modalColorName.trim().charAt(0)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Sizes section inside the modal */}
              <div className="border-t border-gray-100 pt-5">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Sizes & Availability</h4>
                
                {/* Size sub-form */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-4 mb-4">
                  <div className="grid grid-cols-3 gap-3 items-end">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Size Name</label>
                      <input
                        type="text"
                        value={modalNewSizeName}
                        onChange={(e) => setModalNewSizeName(e.target.value)}
                        placeholder="e.g. S, XL, 32"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-gray-900 !text-black !bg-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const sizeVal = modalNewSizeName.trim();
                            if (sizeVal && !modalSizes.some(s => s.size.toLowerCase() === sizeVal.toLowerCase())) {
                              setModalSizes(prev => [...prev, { size: sizeVal, displayForSale: modalNewSizeDisplayForSale, displayForRent: modalNewSizeDisplayForRent }]);
                              setModalNewSizeName("");
                            }
                          }
                        }}
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          const sizeVal = modalNewSizeName.trim();
                          if (sizeVal && !modalSizes.some(s => s.size.toLowerCase() === sizeVal.toLowerCase())) {
                            setModalSizes(prev => [...prev, { size: sizeVal, displayForSale: modalNewSizeDisplayForSale, displayForRent: modalNewSizeDisplayForRent }]);
                            setModalNewSizeName("");
                          }
                        }}
                        disabled={!modalNewSizeName.trim()}
                        className="w-full py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-xs transition active:scale-95 animate-none"
                      >
                        Add Size
                      </button>
                    </div>
                  </div>
                  
                  {/* Availability checkboxes */}
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modalNewSizeDisplayForSale}
                        onChange={(e) => setModalNewSizeDisplayForSale(e.target.checked)}
                        className="w-4 h-4 accent-lime-600 rounded cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-700">Display for Sale</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modalNewSizeDisplayForRent}
                        onChange={(e) => setModalNewSizeDisplayForRent(e.target.checked)}
                        className="w-4 h-4 accent-lime-600 rounded cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-700">Display for Rent</span>
                    </label>
                  </div>
                </div>

                {/* List of sizes added inside the modal */}
                {modalSizes.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {modalSizes.map((sz, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-3 shadow-sm">
                        <span className="font-bold text-sm text-gray-900">{sz.size}</span>
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${sz.displayForSale ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-gray-100 text-gray-400'}`}>
                            Sale
                          </span>
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${sz.displayForRent ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-gray-100 text-gray-400'}`}>
                            Rent
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setModalSizes(prev => prev.filter((_, i) => i !== idx));
                            }}
                            className="text-gray-400 hover:text-red-500 p-1 rounded transition"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic text-center py-4 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    No sizes added for this color yet. Use the sub-form above.
                  </p>
                )}
              </div>

              {/* Main Modal Save action */}
              <button
                type="button"
                onClick={() => {
                  if (!modalColorName.trim()) return;
                  
                  if (editingColorIndex !== null) {
                    const newVariants = [...form.variants];
                    newVariants[editingColorIndex] = {
                      colorName: modalColorName.trim(),
                      colorHex: '',
                      sizes: modalSizes
                    };
                    setForm(prev => ({ ...prev, variants: newVariants }));
                  } else {
                    setForm(prev => ({
                      ...prev,
                      variants: [...prev.variants, {
                        colorName: modalColorName.trim(),
                        colorHex: '',
                        sizes: modalSizes
                      }]
                    }));
                  }
                  setIsColorModalOpen(false);
                }}
                disabled={!modalColorName.trim()}
                className="w-full py-4 mt-4 bg-lime-500 hover:bg-lime-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl transition shadow-lg shadow-lime-500/20 active:scale-95 text-sm uppercase tracking-wider"
              >
                {editingColorIndex !== null ? 'Save Color Group' : 'Add Color Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
