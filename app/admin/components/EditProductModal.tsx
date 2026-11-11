'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { X, AlertCircle, Plus, Check, ChevronRight, Palette, Ruler, Trash2, Star, Eye, ChevronLeft, Loader2 } from 'lucide-react';
import { ProductVideoManager } from './ProductVideoManager';
import { RentLimitField } from './RentLimitField';

// ─── Types ───────────────────────────────────────────────────────────────────
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

export interface Product {
  _id: string;
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[];
  videoUrls?: string[];
  sellPrice: number;
  rentPrice: number;
  category: string;
  costumeType?: string;
  country?: string;
  badge?: string | null;
  variants?: VariantGroup[];
  sizes?: any;
  colors?: any;
  color?: string;
  material?: string;
  condition?: string;
  careInstructions?: string;
  availableForBuy?: boolean;
  availableForRent?: boolean;
  isCostumeShow?: boolean;
  maxRentQuantity?: number | null;
}

// ─── Color resolver ───────────────────────────────────────────────────────────
const colorDictionary: Record<string, string> = {
  burgundy: '#800020', emerald: '#50c878', ruby: '#e0115f', sapphire: '#0f52ba',
  rose: '#ff007f', mint: '#3eb489', mustard: '#e1ad01', wine: '#722f37',
  champagne: '#f7e7ce', cream: '#fffdd0', apricot: '#fbceb1', mauve: '#e0b0ff',
  amber: '#ffbf00', bronze: '#cd7f32', copper: '#b87333', brass: '#b5a642',
  rust: '#b7410e', 'rose gold': '#b76e79', rosegold: '#b76e79',
  'emerald green': '#50c878', 'royal blue': '#4169e1', 'sky blue': '#87ceeb',
  'navy blue': '#000080', 'forest green': '#228b22', 'hot pink': '#ff69b4',
  'dark red': '#8b0000', 'light blue': '#add8e6', gold: '#ffd700',
  silver: '#c0c0c0', black: '#111111', white: '#f5f5f5', red: '#ef4444',
  blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', orange: '#f97316',
  purple: '#a855f7', pink: '#ec4899', gray: '#6b7280', brown: '#92400e',
};

export function getVariantColorStyle(name: string): React.CSSProperties {
  const normalized = name.trim().toLowerCase();
  if (colorDictionary[normalized]) return { backgroundColor: colorDictionary[normalized] };
  if (typeof window !== 'undefined' && CSS.supports('color', normalized))
    return { backgroundColor: normalized };
  const charCode = normalized.charCodeAt(0) || 0;
  const hue = (charCode * 7) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue},70%,60%), hsl(${(hue + 40) % 360},70%,45%))`,
    color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 'bold', fontSize: '0.75rem',
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface EditProductModalProps {
  product: Product | null;
  onClose: () => void;
  onSave: (updatedProduct: Product) => Promise<void>;
  isSaving?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function EditProductModal({
  product,
  onClose,
  onSave,
  isSaving = false,
}: EditProductModalProps) {
  if (!product) return null;

  // ── Migrate legacy data ──
  let initialVariants: VariantGroup[] = [];
  if (Array.isArray(product?.variants) && product.variants.length > 0) {
    initialVariants = product.variants;
  } else if (product) {
    let legacySizes: NestedSizeEntry[] = [];
    if (Array.isArray(product.sizes)) {
      legacySizes = product.sizes
        .map((s: any) => ({
          size: typeof s === 'string' ? s : s.name || s.size || '',
          displayForSale: s.displayInStore !== false && s.displayForSale !== false,
          displayForRent: s.displayInStore !== false && s.displayForRent !== false,
        }))
        .filter((s) => s.size);
    } else if (typeof product.sizes === 'string' && product.sizes.trim()) {
      legacySizes = product.sizes
        .split(',')
        .map((s: string) => ({ size: s.trim(), displayForSale: true, displayForRent: true }))
        .filter((s) => s.size);
    }

    if (Array.isArray(product.colors) && product.colors.length > 0) {
      initialVariants = product.colors
        .map((c: any) => ({
          colorName: typeof c === 'string' ? c : c.name || '',
          colorHex: c.hexCode || '',
          sizes: legacySizes,
        }))
        .filter((c) => c.colorName);
    } else if (typeof product.color === 'string' && product.color.trim()) {
      initialVariants = product.color
        .split(',')
        .map((c: string) => ({ colorName: c.trim(), colorHex: '', sizes: legacySizes }))
        .filter((c) => c.colorName);
    } else if (legacySizes.length > 0) {
      initialVariants = [{ colorName: 'Standard', colorHex: '', sizes: legacySizes }];
    }
  }

  const initialVideoUrls = Array.isArray(product?.videoUrls) ? product.videoUrls : [];
  // Video-only products keep a poster frame in imageUrl - don't show it as an editable photo
  const initialImageUrls = Array.isArray(product?.imageUrls) && product.imageUrls.length > 0
    ? product.imageUrls
    : product?.imageUrl && initialVideoUrls.length === 0
      ? [product.imageUrl]
      : [];

  // ── Form State ──
  const [formData, setFormData] = useState<any>({
    ...product,
    imageUrls: initialImageUrls,
    imageUrl: product?.imageUrl || '',
    videoUrls: initialVideoUrls,
    variants: initialVariants,
    availableForBuy: product.availableForBuy ?? true,
    availableForRent: product.availableForRent ?? true,
    isCostumeShow: product.isCostumeShow ?? false,
    maxRentQuantity: product.maxRentQuantity ?? null,
  });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isPriceOptional, setIsPriceOptional] = useState(false);

  // ── Image Upload/Manager State ──
  const [localUploading, setLocalUploading] = useState(false);
  const [videosUploading, setVideosUploading] = useState(false);
  const [uploadProgressStatus, setUploadProgressStatus] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Image Processing and Helpers ──
  const compressImage = async (base64: string, mimeType: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const img = new (window as any).Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

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

            let quality = 0.9;
            let compressedBase64 = '';

            while (quality > 0.1) {
              compressedBase64 = canvas.toDataURL(mimeType, quality);
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    const currentCount = formData.imageUrls?.length || 0;
    const availableSlots = 8 - currentCount;

    if (availableSlots <= 0) {
      setError("❌ Maximum 8 images limit reached");
      return;
    }

    const filesToProcess = files.slice(0, availableSlots);
    setLocalUploading(true);
    setError('');

    try {
      const processedBase64s: string[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        if (!file.type.startsWith("image/")) {
          throw new Error(`File ${i + 1} is not a valid image`);
        }

        setUploadProgressStatus(`Processing ${i + 1}/${filesToProcess.length}...`);

        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.onload = () => {
            const result = reader.result;
            if (typeof result !== "string" || !result.startsWith("data:")) {
              reject(new Error("Invalid image format"));
              return;
            }
            resolve(result);
          };
          reader.readAsDataURL(file);
        });

        let finalBase64 = base64;
        if (file.size > 500 * 1024) {
          setUploadProgressStatus(`Compressing ${i + 1}/${filesToProcess.length}...`);
          finalBase64 = await compressImage(base64, file.type);
        }

        processedBase64s.push(finalBase64);
      }

      setFormData((prev: any) => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), ...processedBase64s]
      }));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error processing image files');
    } finally {
      setLocalUploading(false);
      setUploadProgressStatus('');
      if (e.target) e.target.value = '';
    }
  };

  const removeImage = (indexToRemove: number) => {
    setFormData((prev: any) => {
      const filtered = (prev.imageUrls || []).filter((_: any, i: number) => i !== indexToRemove);
      return {
        ...prev,
        imageUrls: filtered,
        imageUrl: filtered[0] || ''
      };
    });
  };

  const makePrimary = (indexToMakePrimary: number) => {
    setFormData((prev: any) => {
      const list = [...(prev.imageUrls || [])];
      if (indexToMakePrimary <= 0 || indexToMakePrimary >= list.length) return prev;
      
      const [target] = list.splice(indexToMakePrimary, 1);
      list.unshift(target);

      return {
        ...prev,
        imageUrls: list,
        imageUrl: list[0]
      };
    });
  };

  // Lightbox keyboard navigation
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowRight') {
        setLightboxIndex((prev) => {
          if (prev === null) return null;
          return prev < (formData.imageUrls?.length || 1) - 1 ? prev + 1 : 0;
        });
      } else if (e.key === 'ArrowLeft') {
        setLightboxIndex((prev) => {
          if (prev === null) return null;
          return prev > 0 ? prev - 1 : (formData.imageUrls?.length || 1) - 1;
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, formData.imageUrls]);

  // ── Color Group Modal State ──
  const [isColorModalOpen, setIsColorModalOpen] = useState(false);
  const [editingColorIndex, setEditingColorIndex] = useState<number | null>(null);
  const [modalColorName, setModalColorName] = useState('');
  const [modalSizes, setModalSizes] = useState<NestedSizeEntry[]>([]);
  const [modalNewSizeName, setModalNewSizeName] = useState('');
  const [modalNewSizeForSale, setModalNewSizeForSale] = useState(true);
  const [modalNewSizeForRent, setModalNewSizeForRent] = useState(true);

  // ── Handlers ──
  const handleInput = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({
      ...prev,
      [name]: name === 'sellPrice' || name === 'rentPrice' ? parseFloat(value) || 0 : value,
    }));
  };

  const openAddColorModal = () => {
    setEditingColorIndex(null);
    setModalColorName('');
    setModalSizes([]);
    setModalNewSizeName('');
    setModalNewSizeForSale(true);
    setModalNewSizeForRent(true);
    setIsColorModalOpen(true);
  };

  const openEditColorModal = (idx: number) => {
    const variant = formData.variants[idx];
    setEditingColorIndex(idx);
    setModalColorName(variant.colorName);
    setModalSizes([...(variant.sizes || [])]);
    setModalNewSizeName('');
    setModalNewSizeForSale(true);
    setModalNewSizeForRent(true);
    setIsColorModalOpen(true);
  };

  const addSizeToModal = () => {
    const val = modalNewSizeName.trim();
    if (!val || modalSizes.some((s) => s.size.toLowerCase() === val.toLowerCase())) return;
    setModalSizes((prev) => [
      ...prev,
      { size: val, displayForSale: modalNewSizeForSale, displayForRent: modalNewSizeForRent },
    ]);
    setModalNewSizeName('');
  };

  const saveColorGroup = () => {
    if (!modalColorName.trim()) return;
    const newGroup: VariantGroup = {
      colorName: modalColorName.trim(),
      colorHex: '',
      sizes: modalSizes,
    };
    if (editingColorIndex !== null) {
      const updated = [...formData.variants];
      updated[editingColorIndex] = newGroup;
      setFormData((prev: any) => ({ ...prev, variants: updated }));
    } else {
      setFormData((prev: any) => ({
        ...prev,
        variants: [...(prev.variants || []), newGroup],
      }));
    }
    setIsColorModalOpen(false);
  };

  const removeVariant = (idx: number) => {
    setFormData((prev: any) => ({
      ...prev,
      variants: prev.variants.filter((_: any, i: number) => i !== idx),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    if (!formData.name?.trim()) return setError('Product name is required');
    if (!formData.description?.trim()) return setError('Description is required');
    if (!isPriceOptional && (formData.sellPrice ?? 0) <= 0) return setError('Sell price must be greater than 0');
    if ((formData.imageUrls?.length || 0) === 0 && (formData.videoUrls?.length || 0) === 0) {
      return setError('Add at least one image or video');
    }
    if (videosUploading) return setError('Please wait for your videos to finish uploading');

    setLocalUploading(true);
    let updatedImageUrls = [...(formData.imageUrls || [])];
    const localImageIndices = updatedImageUrls.reduce((acc: number[], url: string, idx: number) => {
      if (url.startsWith('data:image/')) {
        acc.push(idx);
      }
      return acc;
    }, []);

    try {
      if (localImageIndices.length > 0) {
        for (let i = 0; i < localImageIndices.length; i++) {
          const idx = localImageIndices[i];
          const base64Data = updatedImageUrls[idx];
          
          setUploadProgressStatus(`Uploading image ${i + 1} of ${localImageIndices.length}...`);
          
          const uploadController = new AbortController();
          const uploadTimeoutId = setTimeout(() => uploadController.abort(), 120000);
          
          const uploadResponse = await fetch("/api/cloudinary/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageData: base64Data,
              fileName: `product-edit-${Date.now()}-${i}.jpg`
            }),
            signal: uploadController.signal,
          });
          
          clearTimeout(uploadTimeoutId);
          
          if (!uploadResponse.ok) {
            const errData = await uploadResponse.json();
            throw new Error(errData.error || "Failed to upload image to Cloudinary");
          }
          
          const uploadData = await uploadResponse.json();
          if (!uploadData.url) {
            throw new Error("No URL returned from Cloudinary upload");
          }
          
          updatedImageUrls[idx] = uploadData.url;
        }
      }
      
      const finalProduct = {
        ...formData,
        imageUrls: updatedImageUrls,
        imageUrl: updatedImageUrls[0] || '', // guarantee main image is first (server uses a video poster if empty)
        videoUrls: formData.videoUrls || [],
      };

      setUploadProgressStatus('Saving product changes...');
      await onSave(finalProduct);
      setSuccessMessage('✅ Product updated successfully!');
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setLocalUploading(false);
      setUploadProgressStatus('');
    }
  };

  const colorStyle = (name: string) => getVariantColorStyle(name);

  return (
    <>
      {/* ── Main Edit Modal ── */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
            <div>
              <h2 className="text-xl font-black text-gray-900">Edit Product</h2>
              <p className="text-xs text-lime-600 font-semibold uppercase tracking-widest mt-0.5">
                EMPI Costumes Admin
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">

            {/* Alerts */}
            {error && (
              <div className="flex gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700 font-medium">{error}</p>
              </div>
            )}
            {successMessage && (
              <div className="flex gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                <Check className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-700 font-medium">{successMessage}</p>
              </div>
            )}
            {uploadProgressStatus && (
              <div className="flex gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl animate-pulse">
                <Loader2 className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
                <p className="text-sm text-blue-700 font-medium">{uploadProgressStatus}</p>
              </div>
            )}

            {/* Image Manager Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                  Product Images
                </label>
                {formData.imageUrls && formData.imageUrls.length > 0 && (
                  <span className="text-xs bg-lime-100 text-lime-700 px-3 py-0.5 rounded-full font-bold">
                    {formData.imageUrls.length} photo{formData.imageUrls.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Thumbnails Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50 rounded-2xl border border-gray-200 p-4">
                {formData.imageUrls && formData.imageUrls.map((imgUrl: string, idx: number) => {
                  const isMain = idx === 0;
                  return (
                    <div
                      key={idx}
                      className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 border-2 border-gray-200 hover:border-lime-400 transition shadow-sm"
                    >
                      {/* Image Thumbnail */}
                      <Image
                        src={imgUrl}
                        alt={`Product Image ${idx + 1}`}
                        fill
                        className="object-cover cursor-pointer group-hover:scale-105 transition duration-300"
                        onClick={() => setLightboxIndex(idx)}
                      />

                      {/* Main Image Badge */}
                      {isMain ? (
                        <div className="absolute top-2 left-2 bg-lime-600 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow">
                          Main
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => makePrimary(idx)}
                          className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded shadow opacity-0 group-hover:opacity-100 transition flex items-center gap-0.5"
                          title="Set as main image"
                        >
                          <Star className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                          Set Main
                        </button>
                      )}

                      {/* Hover Overlay with Delete & Zoom Button */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(idx)}
                          className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition"
                          title="View Full Size"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-full transition"
                          title="Delete Image"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Add Photo Button Card */}
                {(!formData.imageUrls || formData.imageUrls.length < 8) && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={localUploading}
                    className="flex flex-col items-center justify-center aspect-square bg-white border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-lime-50/50 hover:border-lime-400 transition"
                  >
                    <Plus className="h-5 w-5 text-lime-600 mb-1" />
                    <span className="text-[10px] font-bold text-gray-500">Add Photo</span>
                    <span className="text-[8px] text-gray-400">({8 - (formData.imageUrls?.length || 0)} left)</span>
                  </button>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <p className="text-[11px] text-gray-400">
                ✨ Click any photo to view full size. The first photo is the main product image.
              </p>
            </div>

            {/* Video Manager Section */}
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest">
                Product Videos
              </label>
              <ProductVideoManager
                videoUrls={formData.videoUrls || []}
                onChange={(update) => setFormData((prev: any) => ({ ...prev, videoUrls: update(prev.videoUrls || []) }))}
                onUploadingChange={setVideosUploading}
                disabled={isSaving || localUploading}
              />
            </div>

            {/* ── Section: Basic Info ── */}
            <div className="space-y-4">
              <SectionTitle emoji="📋" title="Basic Information" />

              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  Product Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleInput}
                  placeholder="e.g., Sexy in Red Carnival Set"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  Description *
                </label>
                <textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={handleInput}
                  rows={3}
                  placeholder="Describe the costume..."
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                />
              </div>
            </div>

            {/* ── Section: Pricing ── */}
            <div className="space-y-4">
              <SectionTitle emoji="💰" title="Pricing" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Sell Price (₦) {isPriceOptional ? <span className="text-gray-400 font-normal lowercase">(optional)</span> : '*'}
                  </label>
                  <input
                    type="number"
                    name="sellPrice"
                    value={formData.sellPrice || ''}
                    onChange={handleInput}
                    placeholder="0"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Rent Price (₦/day)
                  </label>
                  <input
                    type="number"
                    name="rentPrice"
                    value={formData.rentPrice || ''}
                    onChange={handleInput}
                    placeholder="0"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                  />
                </div>
              </div>
            </div>

            {/* ── Section: Categories ── */}
            <div className="space-y-4">
              <SectionTitle emoji="🎭" title="Category & Type" />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Category *
                  </label>
                  <select
                    name="category"
                    value={formData.category || 'adults'}
                    onChange={handleInput}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                  >
                    <option value="adults">👔 Adults</option>
                    <option value="kids">👶 Kids</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Costume Type
                  </label>
                  <select
                    name="costumeType"
                    value={formData.costumeType || 'Other'}
                    onChange={handleInput}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                  >
                    <option value="Angel">👼 Angel</option>
                    <option value="Carnival">🎪 Carnival</option>
                    <option value="Western">🤠 Western</option>
                    <option value="Traditional Africa">🥁 Traditional Africa</option>
                    <option value="Cosplay">🎭 Cosplay</option>
                    <option value="Superhero">🦸 Superhero</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Condition & Material */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Condition
                  </label>
                  <select
                    name="condition"
                    value={formData.condition || ''}
                    onChange={handleInput}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                  >
                    <option value="">Select condition</option>
                    <option value="new">✨ New</option>
                    <option value="like-new">⭐ Like New</option>
                    <option value="good">👍 Good</option>
                    <option value="fair">🔧 Fair</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                    Material
                  </label>
                  <input
                    type="text"
                    name="material"
                    value={formData.material || ''}
                    onChange={handleInput}
                    placeholder="e.g., Cotton, Silk"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                  />
                </div>
              </div>

              {/* Badge */}
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                  Badge <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="badge"
                  value={formData.badge || ''}
                  onChange={handleInput}
                  placeholder="e.g., New, Sale, Premium"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-lime-400 !text-black !bg-white"
                />
              </div>
            </div>

            {/* ── Section: Variants ── */}
            <div className="space-y-4">
              <SectionTitle emoji="👕" title="Colors & Sizes Variants" />

              <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4">
                {/* Add Color Button */}
                <div className="flex justify-center mb-4">
                  <button
                    type="button"
                    onClick={openAddColorModal}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gray-900 to-black text-white rounded-xl text-sm font-bold shadow hover:shadow-lg transition hover:-translate-y-0.5 active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    Add Color Group
                  </button>
                </div>

                {/* Variant Cards */}
                {formData.variants && formData.variants.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {formData.variants.map((variant: VariantGroup, vIdx: number) => {
                      const cs = colorStyle(variant.colorName);
                      const isGradient = !!cs.background;
                      return (
                        <div
                          key={vIdx}
                          className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow transition"
                        >
                          {/* Color Header */}
                          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50/60">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-5 h-5 rounded-full border border-gray-200 shadow-inner flex-shrink-0 flex items-center justify-center"
                                style={cs}
                              >
                                {isGradient && (
                                  <span className="text-white text-[8px] font-black uppercase">
                                    {variant.colorName.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <span className="font-bold text-gray-900 text-xs">
                                {variant.colorName}
                              </span>
                              <span className="text-[9px] font-bold bg-gray-200/70 text-gray-500 px-1.5 py-0.5 rounded">
                                {variant.sizes?.length || 0} sizes
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditColorModal(vIdx)}
                                className="text-[10px] font-black text-lime-600 hover:bg-lime-50 px-2 py-1 rounded transition uppercase tracking-wider"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => removeVariant(vIdx)}
                                className="text-gray-300 hover:text-red-400 hover:bg-red-50 p-1 rounded transition"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Sizes */}
                          <div className="p-2.5 flex flex-wrap gap-1.5">
                            {variant.sizes && variant.sizes.length > 0 ? (
                              variant.sizes.map((sz, sIdx) => {
                                const tag = [sz.displayForSale ? 'S' : '', sz.displayForRent ? 'R' : '']
                                  .filter(Boolean)
                                  .join('/');
                                return (
                                  <span
                                    key={sIdx}
                                    className="inline-flex items-center gap-0.5 bg-gray-100 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded"
                                  >
                                    {sz.size}
                                    {tag && (
                                      <span className="text-[8px] text-gray-400 font-black ml-0.5">
                                        ({tag})
                                      </span>
                                    )}
                                  </span>
                                );
                              })
                            ) : (
                              <p className="text-[11px] text-gray-400 italic">
                                No sizes — click Edit to add
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
                    <Palette className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-bold text-gray-400">No variants yet</p>
                    <p className="text-xs text-gray-400">Click "Add Color Group" to start</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section: Availability ── */}
            <div className="space-y-3">
              <SectionTitle emoji="📦" title="Availability" />
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-lime-300 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={formData.availableForBuy ?? true}
                  onChange={(e) => setFormData((p: any) => ({ ...p, availableForBuy: e.target.checked }))}
                  className="w-5 h-5 accent-lime-600 rounded"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">🛒 Available for Purchase</p>
                  <p className="text-xs text-gray-500">Show this product in the sale section</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-lime-300 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={formData.availableForRent ?? true}
                  onChange={(e) => setFormData((p: any) => ({ ...p, availableForRent: e.target.checked }))}
                  className="w-5 h-5 accent-lime-600 rounded"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">🎪 Available for Rental</p>
                  <p className="text-xs text-gray-500">Show this product in the rental section</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:border-lime-300 cursor-pointer transition">
                <input
                  type="checkbox"
                  checked={formData.isCostumeShow ?? false}
                  onChange={(e) => setFormData((p: any) => ({ ...p, isCostumeShow: e.target.checked }))}
                  className="w-5 h-5 accent-lime-600 rounded"
                />
                <div>
                  <p className="text-sm font-semibold text-gray-900">✨ Featured in THE COSTUME SHOW 2026</p>
                  <p className="text-xs text-gray-500">Show this product in the Costume Show special collection</p>
                </div>
              </label>
              <RentLimitField
                value={formData.maxRentQuantity}
                onChange={(v) => setFormData((p: any) => ({ ...p, maxRentQuantity: v }))}
                isCostumeShow={formData.isCostumeShow ?? false}
                availableForRent={formData.availableForRent ?? true}
              />
            </div>

            {/* ── Sticky Footer Actions ── */}
            <div className="flex gap-3 pt-2 border-t border-gray-100 sticky bottom-0 bg-white py-4">
              <button
                type="submit"
                disabled={isSaving || localUploading || videosUploading}
                className="flex-1 py-3 px-4 bg-lime-600 hover:bg-lime-700 text-white rounded-xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-lime-500/20 active:scale-95"
              >
                {isSaving || localUploading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block animate-spin">⏳</span>
                    {uploadProgressStatus || 'Saving...'}
                  </span>
                ) : (
                  '✅ Save Changes'
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving || localUploading}
                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-900 rounded-xl font-bold transition disabled:opacity-50 active:scale-95"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── Lightbox Gallery Modal ── */}
      {lightboxIndex !== null && formData.imageUrls && formData.imageUrls[lightboxIndex] && (
        <div className="fixed inset-0 z-[300] bg-black/95 flex flex-col justify-between p-4 md:p-8 backdrop-blur-md">
          {/* Lightbox Header */}
          <div className="flex items-center justify-between text-white z-10">
            <div>
              <h4 className="text-sm font-bold truncate max-w-xs sm:max-w-md">{formData.name}</h4>
              <p className="text-xs text-gray-400">
                Image {lightboxIndex + 1} of {formData.imageUrls.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLightboxIndex(null)}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Lightbox Main Image Container */}
          <div className="relative flex-1 w-full flex items-center justify-center mt-4 mb-4 select-none">
            {/* Left Nav Arrow */}
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((prev) => {
                  if (prev === null) return null;
                  return prev > 0 ? prev - 1 : formData.imageUrls.length - 1;
                })
              }
              className="absolute left-2 md:left-4 z-10 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition duration-200"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            {/* Main Image */}
            <div className="relative w-full h-[70vh] max-h-[70vh]">
              <Image
                src={formData.imageUrls[lightboxIndex]}
                alt={`Full-size Product Image ${lightboxIndex + 1}`}
                fill
                className="object-contain"
                priority
              />
            </div>

            {/* Right Nav Arrow */}
            <button
              type="button"
              onClick={() =>
                setLightboxIndex((prev) => {
                  if (prev === null) return null;
                  return prev < formData.imageUrls.length - 1 ? prev + 1 : 0;
                })
              }
              className="absolute right-2 md:right-4 z-10 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full backdrop-blur-sm transition duration-200"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>

          {/* Lightbox Footer / Thumbnails List */}
          <div className="flex flex-col items-center gap-4 z-10">
            <div className="flex gap-2 overflow-x-auto max-w-full py-2 px-4 bg-white/5 rounded-2xl backdrop-blur-sm">
              {formData.imageUrls.map((thumbUrl: string, idx: number) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setLightboxIndex(idx)}
                  className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    idx === lightboxIndex ? 'border-lime-500 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <Image src={thumbUrl} alt={`Thumbnail ${idx + 1}`} fill className="object-cover" />
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 hidden sm:block">
              Tip: Use Left/Right Arrow keys to navigate, Esc to close.
            </p>
          </div>
        </div>
      )}

      {/* ── Color Group Sub-Modal ── */}
      {isColorModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-black text-gray-900">
                  {editingColorIndex !== null ? 'Edit Color Group' : 'Add Color Group'}
                </h3>
                <p className="text-xs font-bold text-lime-600 uppercase tracking-widest mt-0.5">
                  Configure color & sizes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsColorModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Color Name + Preview */}
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-widest mb-2">
                  Color Name
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={modalColorName}
                    onChange={(e) => setModalColorName(e.target.value)}
                    placeholder="e.g. Midnight Blue, Crimson Red"
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-gray-900 !text-black !bg-white transition"
                    autoFocus
                  />
                  {modalColorName.trim() && (
                    <div
                      className="w-12 h-12 rounded-xl border border-gray-200 shadow-inner flex-shrink-0 flex items-center justify-center transition-all"
                      style={colorStyle(modalColorName)}
                    >
                      {colorStyle(modalColorName).display === 'flex' && (
                        <span className="text-white text-xs font-black uppercase">
                          {modalColorName.trim().charAt(0)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  The color will auto-preview — try: red, gold, navy blue, rose gold…
                </p>
              </div>

              {/* Sizes Section */}
              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Ruler className="w-3.5 h-3.5 text-gray-500" />
                  <h4 className="text-xs font-bold text-gray-700 uppercase tracking-widest">
                    Sizes & Availability
                  </h4>
                </div>

                {/* Add Size Sub-form */}
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3 mb-3">
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Size
                      </label>
                      <input
                        type="text"
                        value={modalNewSizeName}
                        onChange={(e) => setModalNewSizeName(e.target.value)}
                        placeholder="e.g. S, XL, 32"
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-gray-900 !text-black !bg-white"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSizeToModal();
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={addSizeToModal}
                      disabled={!modalNewSizeName.trim()}
                      className="py-2.5 bg-gray-900 hover:bg-black disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl text-xs transition active:scale-95"
                    >
                      Add
                    </button>
                  </div>

                  {/* Availability Checkboxes */}
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modalNewSizeForSale}
                        onChange={(e) => setModalNewSizeForSale(e.target.checked)}
                        className="w-4 h-4 accent-lime-600 rounded cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-700">For Sale</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={modalNewSizeForRent}
                        onChange={(e) => setModalNewSizeForRent(e.target.checked)}
                        className="w-4 h-4 accent-blue-500 rounded cursor-pointer"
                      />
                      <span className="text-xs font-bold text-gray-700">For Rent</span>
                    </label>
                  </div>
                </div>

                {/* Added Sizes List */}
                {modalSizes.length > 0 ? (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                    {modalSizes.map((sz, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm"
                      >
                        <span className="font-bold text-sm text-gray-900">{sz.size}</span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              sz.displayForSale
                                ? 'bg-green-50 text-green-700 border-green-100'
                                : 'bg-gray-100 text-gray-400 border-gray-200'
                            }`}
                          >
                            Sale
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                              sz.displayForRent
                                ? 'bg-blue-50 text-blue-700 border-blue-100'
                                : 'bg-gray-100 text-gray-400 border-gray-200'
                            }`}
                          >
                            Rent
                          </span>
                          <button
                            type="button"
                            onClick={() => setModalSizes((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-400 p-1 rounded transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-5 border-2 border-dashed border-gray-200 rounded-2xl">
                    <Ruler className="w-5 h-5 text-gray-300 mx-auto mb-1.5" />
                    <p className="text-xs text-gray-400 italic">
                      No sizes added yet — type a size and click Add
                    </p>
                  </div>
                )}
              </div>

              {/* Save Button */}
              <button
                type="button"
                onClick={saveColorGroup}
                disabled={!modalColorName.trim()}
                className="w-full py-3.5 bg-lime-500 hover:bg-lime-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black rounded-xl transition shadow-lg shadow-lime-500/20 active:scale-95 text-sm uppercase tracking-wider"
              >
                {editingColorIndex !== null ? '✅ Save Changes' : '➕ Add Color Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Helper: Section Title ────────────────────────────────────────────────────
function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <div className="flex items-center gap-2 pb-1 border-b border-gray-100">
      <span className="text-base">{emoji}</span>
      <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest">{title}</h3>
    </div>
  );
}
