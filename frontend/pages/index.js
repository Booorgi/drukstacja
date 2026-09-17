import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import { authHeaders, createOrder, createRfqOrder, fetchCartOrders } from "../lib/ordersApi";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import Navbar from "../components/Navbar";
import MaterialCatalog from "../components/MaterialCatalog";
import StudioWheel from "../components/StudioWheel";
import StudioPrintSettings from "../components/StudioPrintSettings";
import StudioPrintParams from "../components/StudioPrintParams";
import StudioFileProfile from "../components/StudioFileProfile";
import StudioEmptyDropzone from "../components/StudioEmptyDropzone";
import StudioPreviewUnavailable from "../components/StudioPreviewUnavailable";
import StudioControlRail from "../components/StudioControlRail";
import StudioQuoteBar from "../components/StudioQuoteBar";
import StudioScale from "../components/StudioScale";
import StudioColorPicker from "../components/StudioColorPicker";
import StudioMaterialPicker from "../components/StudioMaterialPicker";
import StudioMobileSheet from "../components/StudioMobileSheet";
import PrinterLayersBand from "../components/PrinterLayersBand";
import { STL_MATERIALS } from "../lib/filament";
import {
  STUDIO_FAMILIES,
  familyForMaterial,
  materialById,
  materialIdFromFilamentType,
  quoteUnitPriceFromWeight,
  studioFamiliesForWheel,
} from "../lib/filamentCatalog";
import {
  formatAmsMaterialLabel,
  normalizeAmsColours,
  scaleLengthForDensity,
  scaleWeightForDensity,
  replaceAmsSlot,
} from "../lib/amsColours";
import commercialPricing from "../lib/commercialPricing";
import {
  peek3mfSidecar,
  canQuoteFromPeekedSliceInfo,
} from "../lib/peek3mfProfile";
import {
  fetchAnalyzeModelWithRetry,
  analyzeClientOutcome,
  logAnalyzeAttempt,
} from "../lib/analyzeModelRetry.cjs";
import {
  isQuotedModel,
  isPreviewSkipped,
  isBambuSliceQuote,
  studioVolumeCm3,
  studioPreviewImageUrl,
  quoteAnalysisFromPeekedSliceInfo,
  mergeAnalyzeWithPeekedSliceQuote,
  ANALYZE_TIMEOUT_RFQ_MSG,
  LARGE_3MF_QUOTE_NO_PREVIEW_MSG,
  LARGE_3MF_QUOTE_THUMBNAIL_MSG,
  SLICE_INFO_QUOTE_NOTE,
} from "../lib/studioQuote";
import printBed from "../lib/printBed";
import useMediaQuery from "../lib/useMediaQuery";

const {
  sourceDimensionsMm,
  scaledDimensionsMm,
  isOverPrintBed,
  fitToPrintBedPercent,
} = printBed;

const { MINIMUM_ORDER_VALUE_PLN, canonicalPrintTimeHours } = commercialPricing;

const API_URL = process.env.NEXT_PUBLIC_API_URL;

function resolveAssetUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = String(API_URL || "").replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${base}${path}`;
}

const CadViewer3D = dynamic(() => import("../components/CadViewer3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[400px] lg:h-[480px] bg-transparent animate-pulse flex items-center justify-center text-xs font-semibold text-zinc-500">
      Ładowanie podglądu…
    </div>
  ),
});

export default function Home() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [modelPreviewUrl, setModelPreviewUrl] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // Inżynieryjny dobór materiału i koloru
  const [selectedMaterialGroup, setSelectedMaterialGroup] = useState("all");
  const [selectedMaterial, setSelectedMaterial] = useState(STL_MATERIALS[0].id);
  const [selectedColor, setSelectedColor] = useState(STL_MATERIALS[0].colors[0].hex);
  const [amsColours, setAmsColours] = useState([]);
  const [amsSlotIndex, setAmsSlotIndex] = useState(0);

  const filteredMaterials = useMemo(() => {
    if (selectedMaterialGroup === "all") return STL_MATERIALS;
    if (selectedMaterialGroup === "tech") {
      return STL_MATERIALS.filter((m) => m.group === "tech" || m.group === "composite" || m.group === "flex");
    }
    return STL_MATERIALS.filter((m) => m.group === selectedMaterialGroup);
  }, [selectedMaterialGroup]);

  const currentIndex = useMemo(() => {
    const idx = filteredMaterials.findIndex((m) => m.id === selectedMaterial);
    return idx >= 0 ? idx : 0;
  }, [filteredMaterials, selectedMaterial]);

  function applyAmsColours(colours) {
    const next = normalizeAmsColours(colours);
    setAmsColours(next);
    if (next[0]) setSelectedColor(next[0]);
  }

  function handleSelectMaterial(matId, { preserveColors = false } = {}) {
    const targetMat = materialById(matId);
    if (!targetMat) return;

    setSelectedMaterial(targetMat.id);

    if (selectedMaterialGroup !== "all") {
      const isVisibleInGroup =
        selectedMaterialGroup === "tech"
          ? targetMat.group === "tech" || targetMat.group === "composite" || targetMat.group === "flex"
          : targetMat.group === selectedMaterialGroup;
      if (!isVisibleInGroup) {
        setSelectedMaterialGroup("all");
      }
    }

    if (!preserveColors && targetMat.colors && targetMat.colors.length > 0) {
      setSelectedColor(targetMat.colors[0].hex);
    }

    const isPla = String(targetMat.familyId || targetMat.id).toUpperCase() === "PLA";
    if (!isPla) {
      setNozzleSize(0.4);
    }
  }

  function handleSelectGroup(groupId) {
    setSelectedMaterialGroup(groupId);
    const list =
      groupId === "all"
        ? STL_MATERIALS
        : groupId === "tech"
        ? STL_MATERIALS.filter((m) => m.group === "tech" || m.group === "composite" || m.group === "flex")
        : STL_MATERIALS.filter((m) => m.group === groupId);
    if (list.length > 0 && !list.some((m) => m.id === selectedMaterial)) {
      handleSelectMaterial(list[0].id);
    }
  }

  function handlePrevMaterial() {
    if (filteredMaterials.length === 0) return;
    const prevIdx = (currentIndex - 1 + filteredMaterials.length) % filteredMaterials.length;
    handleSelectMaterial(filteredMaterials[prevIdx].id);
  }

  function handleNextMaterial() {
    if (filteredMaterials.length === 0) return;
    const nextIdx = (currentIndex + 1) % filteredMaterials.length;
    handleSelectMaterial(filteredMaterials[nextIdx].id);
  }

  const [layerHeight, setLayerHeight] = useState(0.20);
  const [nozzleSize, setNozzleSize] = useState(0.4);
  const [infill, setInfill] = useState(20);
  const [isReslicing, setIsReslicing] = useState(false);
  const [showSupports, setShowSupports] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [addingToCart, setAddingToCart] = useState(false);
  const [printParamsOpen, setPrintParamsOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scalePercent, setScalePercent] = useState(100);
  // Stub OMS flag: no dedicated backend column yet. Persisted in `technology`
  // as "Weryfikacja inżyniera przed drukiem" when the customer checks the box.
  const [engineerReview, setEngineerReview] = useState(false);
  const fileInputRef = useRef(null);
  const printParamsRef = useRef(null);
  const printParamsSheetRef = useRef(null);
  const colorPickerRef = useRef(null);
  const colorSheetRef = useRef(null);
  const materialPickerRef = useRef(null);
  const materialSheetRef = useRef(null);
  const scaleParamsRef = useRef(null);
  const scaleSheetRef = useRef(null);
  const modelScale = Math.max(0.05, Math.min(2, scalePercent / 100));
  const isMdUp = useMediaQuery("(min-width: 768px)");

  function handleSelectColor(item) {
    if (item?.hex) setSelectedColor(item.hex);
    setColorPickerOpen(false);
  }

  function handleSelectAmsSlotColor(item) {
    if (!item?.hex) return;
    const slot = amsSlotIndex;
    const fallback =
      analysisData?.file_profile?.filament_colours || analysisData?.filament_colours || [];
    setAmsColours((prev) => {
      const next = replaceAmsSlot(prev, fallback, slot, item.hex);
      if (slot === 0 || next.length === 1) {
        setSelectedColor(item.hex);
      }
      return next;
    });
    setColorPickerOpen(false);
  }

  function handleSelectMaterialFromPicker(subtype) {
    if (subtype?.id) handleSelectMaterial(subtype.id);
    setMaterialPickerOpen(false);
  }

  function handleSelectMaterialFor3mf(subtype) {
    if (subtype?.id) handleSelectMaterial(subtype.id, { preserveColors: true });
    setMaterialPickerOpen(false);
  }

  function openAmsSlotPicker(index) {
    setAmsSlotIndex(index);
    closeOtherStudioPickers("color");
    setColorPickerOpen(true);
  }

  function openAmsMaterialPicker() {
    closeOtherStudioPickers("material");
    setMaterialPickerOpen(true);
  }

  function closeOtherStudioPickers(keep) {
    if (keep !== "material") setMaterialPickerOpen(false);
    if (keep !== "color") setColorPickerOpen(false);
    if (keep !== "params") setPrintParamsOpen(false);
    if (keep !== "scale") setScaleOpen(false);
  }

  // Gdy 3MF ma kolory w profilu, a lokalny stan AMS jest pusty — zsynchronizuj (żeby remap działał).
  useEffect(() => {
    if (amsColours.length) return;
    const fromFile = normalizeAmsColours(
      analysisData?.file_profile?.filament_colours || analysisData?.filament_colours || []
    );
    if (fromFile.length) applyAmsColours(fromFile);
  }, [
    amsColours.length,
    analysisData?.file_profile?.filament_colours,
    analysisData?.filament_colours,
  ]);

  // Weryfikacja tworzywa PLA dla dyszy 0.2 mm
  const isPlaMaterial = useMemo(() => {
    return String(materialById(selectedMaterial)?.familyId || "").toUpperCase() === "PLA";
  }, [selectedMaterial]);

  // Automatyczny powrót do dyszy 0.4 mm przy wyborze materiału nie-PLA
  useEffect(() => {
    if (!isPlaMaterial && nozzleSize === 0.2) {
      setNozzleSize(0.4);
    }
  }, [isPlaMaterial, nozzleSize]);

  useEffect(() => {
    if (!printParamsOpen && !scaleOpen && !colorPickerOpen && !materialPickerOpen) return undefined;
    function outside(el, sheetEl, target) {
      return Boolean(el) && !el.contains(target) && !sheetEl?.contains(target);
    }
    function onDocClick(e) {
      if (printParamsOpen && outside(printParamsRef.current, printParamsSheetRef.current, e.target)) {
        setPrintParamsOpen(false);
      }
      if (scaleOpen && outside(scaleParamsRef.current, scaleSheetRef.current, e.target)) {
        setScaleOpen(false);
      }
      if (colorPickerOpen && outside(colorPickerRef.current, colorSheetRef.current, e.target)) {
        setColorPickerOpen(false);
      }
      if (materialPickerOpen && outside(materialPickerRef.current, materialSheetRef.current, e.target)) {
        setMaterialPickerOpen(false);
      }
    }
    function onKey(e) {
      if (e.key !== "Escape") return;
      setPrintParamsOpen(false);
      setScaleOpen(false);
      setColorPickerOpen(false);
      setMaterialPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [printParamsOpen, scaleOpen, colorPickerOpen, materialPickerOpen]);

  // Dostępne wysokości warstwy dopasowane do wybranej średnicy dyszy
  const layerHeightOptions = useMemo(() => {
    if (nozzleSize === 0.2) {
      return [
        {
          val: 0.08,
          label: "0.08 mm",
          title: "Ultra Detal",
          subtitle: "Mikrodruki i figurki",
          multiplier: "+30%",
          badge: "Ultra",
        },
        {
          val: 0.12,
          label: "0.12 mm",
          title: "Wysoka Precyzja",
          subtitle: "Zbalansowany detal",
          multiplier: "+15%",
          badge: "Optimum",
        },
        {
          val: 0.16,
          label: "0.16 mm",
          title: "Standard 0.2",
          subtitle: "Maks. dla dyszy 0.2",
          multiplier: "1.0x",
          badge: "Standard",
        },
      ];
    }
    return [
      {
        val: 0.12,
        label: "0.12 mm",
        title: "Ultra Detail",
        subtitle: "Wysoka precyzja",
        multiplier: "+25%",
        badge: "Gładki",
      },
      {
        val: 0.20,
        label: "0.20 mm",
        title: "Standard",
        subtitle: "Zbalansowana",
        multiplier: "1.0x",
        badge: "Domyślny",
      },
      {
        val: 0.28,
        label: "0.28 mm",
        title: "Draft",
        subtitle: "Szybki prototyp",
        multiplier: "-10%",
        badge: "Szybki",
      },
    ];
  }, [nozzleSize]);

  // Automatyczne dopasowanie wybranej warstwy po zmianie dyszy
  useEffect(() => {
    const isValid = layerHeightOptions.some((opt) => Math.abs(opt.val - layerHeight) < 0.01);
    if (!isValid) {
      setLayerHeight(nozzleSize === 0.2 ? 0.12 : 0.20);
    }
  }, [nozzleSize, layerHeightOptions, layerHeight]);

  // Stan wyceny inżynierskiej / RFQ (pliki 2D, PCB, CAD projektowe, archiwa)
  const [rfqName, setRfqName] = useState("");
  const [rfqEmail, setRfqEmail] = useState("");
  const [rfqPhone, setRfqPhone] = useState("");
  const [rfqQuantity, setRfqQuantity] = useState(1);
  const [rfqNotes, setRfqNotes] = useState("");
  const [rfqSubmitting, setRfqSubmitting] = useState(false);
  const [rfqSubmitted, setRfqSubmitted] = useState(false);

  async function fetchCart(userId) {
    if (!userId) return;
    try {
      const data = await fetchCartOrders();
      setCartItems(data);
    } catch (err) {
      console.warn("Błąd koszyka:", err);
    }
  }

  // Opt-in layout fixtures so empty vs quoted vs skipped-preview can be
  // checked without the analyze API (`/?studioLayout=quoted`).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const layout = new URLSearchParams(window.location.search).get("studioLayout");
    if (!layout) return;

    if (layout === "quoted") {
      const stl = `solid fixture
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid fixture
`;
      const file = new File([stl], "Watch case 1.stl", { type: "model/stl" });
      setSelectedFile(file);
      setModelPreviewUrl(URL.createObjectURL(file));
      setAnalysisData({
        instant_pricing: true,
        volume_cm3: 8.8,
        dimensions_mm: [40, 40, 10],
        file_key: "layout-fixture",
        print_time_formatted: "54m",
        print_time_hours: 0.9,
        // Commercial: 390 g × 0.045 × 2 + 0.9 h + 2 setup = 38.00 PLN (>= MOQ)
        filament_weight_g: 390,
        filament_length_m: 2.94,
        price_breakdown: { unit_price_pln: 38 },
      });
      return;
    }

    if (layout === "below-moq") {
      const stl = `solid fixture
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid fixture
`;
      const file = new File([stl], "Watch case 1.stl", { type: "model/stl" });
      setSelectedFile(file);
      setModelPreviewUrl(URL.createObjectURL(file));
      setAnalysisData({
        instant_pricing: true,
        volume_cm3: 8.8,
        dimensions_mm: [40, 40, 10],
        file_key: "layout-below-moq-fixture",
        print_time_formatted: "54m",
        print_time_hours: 0.9,
        // Commercial: 172.222222 g × 0.045 × 2 + 0.9 h + 2 setup = 18.40 PLN (shortfall 11.60)
        filament_weight_g: 172.222222,
        filament_length_m: 2.94,
        price_breakdown: { unit_price_pln: 18.4 },
      });
      return;
    }

    if (layout === "whale") {
      const file = new File(["x"], "whale_stl.stl", { type: "model/stl" });
      setSelectedFile(file);
      setModelPreviewUrl(URL.createObjectURL(file));
      setInfill(20);
      setLayerHeight(0.2);
      setNozzleSize(0.4);
      setSelectedMaterial("PLA_STANDARD");
      setAnalysisData({
        instant_pricing: true,
        volume_cm3: 98.1,
        source_volume_cm3: 98.1,
        dimensions_mm: [81.53, 160.23, 96.27],
        file_key: "layout-whale-fixture",
        original_filename: "whale_stl.stl",
        print_time_formatted: "5h 27m",
        print_time_hours: 5.45,
        filament_weight_g: 57.2,
        filament_length_m: 19.18,
        price_breakdown: { unit_price_pln: 12.6 },
      });
      return;
    }

    if (layout === "oversized") {
      const stl = `solid fixture
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 10 0 0
    vertex 0 10 0
  endloop
endfacet
endsolid fixture
`;
      const file = new File([stl], "monstera_b02.glb", { type: "model/gltf-binary" });
      setSelectedFile(file);
      setModelPreviewUrl(URL.createObjectURL(file));
      setAnalysisData({
        instant_pricing: true,
        volume_cm3: 48.2,
        source_volume_cm3: 48.2,
        dimensions_mm: [388.6, 343.1, 393.9],
        source_dimensions_mm: [388.6, 343.1, 393.9],
        file_key: "layout-oversized-fixture",
        print_time_formatted: "3d 23h 9m",
        filament_weight_g: 1841,
        filament_length_m: 617.26,
        price_breakdown: { unit_price_pln: 497.07 },
      });
      return;
    }

    if (layout === "preview-skipped" || layout === "preview-skipped-quoted") {
      const file = new File(["x"], "Jaguar v2 Bambu.3mf", { type: "model/3mf" });
      setSelectedFile(file);
      setModelPreviewUrl(null);
      setPreviewImageUrl(null);
      setInfill(5);
      setLayerHeight(0.2);
      setNozzleSize(0.4);
      setSelectedMaterial("PLA_STANDARD");
      applyAmsColours(["#080504", "#854A22", "#C4864F", "#DFDFDE"]);
      setAnalysisData({
        instant_pricing: true,
        skipped_geometry: false,
        skipped_colored_preview: true,
        preview_skipped: true,
        quote_ready: true,
        volume_cm3: 842.1,
        file_key: "layout-jaguar-fixture",
        original_filename: "Jaguar v2 Bambu.3mf",
        filament_weight_g: 518,
        print_time_formatted: "1d 3h 40m",
        print_time_hours: 27.67,
        price_breakdown: { unit_price_pln: 76.29 },
        file_profile: {
          filament_colours: ["#080504", "#854A22", "#C4864F", "#DFDFDE"],
          filament_types: ["PLA Matte", "PLA Basic"],
          layer_height: 0.2,
          nozzle_size: 0.4,
          infill: 5,
        },
        message: LARGE_3MF_QUOTE_NO_PREVIEW_MSG,
      });
      return;
    }

    if (layout === "preview-skipped-photo") {
      const file = new File(["x"], "Jaguar v2 Bambu.3mf", { type: "model/3mf" });
      const platePhoto = "/fixtures/plate_1.png";
      setSelectedFile(file);
      setModelPreviewUrl(null);
      setPreviewImageUrl(platePhoto);
      setInfill(5);
      setLayerHeight(0.2);
      setNozzleSize(0.4);
      setSelectedMaterial("PLA_STANDARD");
      applyAmsColours(["#080504", "#854A22", "#C4864F", "#DFDFDE"]);
      setAnalysisData({
        instant_pricing: true,
        skipped_geometry: false,
        skipped_colored_preview: true,
        preview_skipped: true,
        quote_ready: true,
        volume_cm3: 842.1,
        file_key: "layout-jaguar-photo-fixture",
        original_filename: "Jaguar v2 Bambu.3mf",
        filament_weight_g: 518,
        print_time_formatted: "1d 3h 40m",
        print_time_hours: 27.67,
        price_breakdown: { unit_price_pln: 76.29 },
        preview_image_url: platePhoto,
        preview_image_source: "Metadata/plate_1.png",
        file_profile: {
          filament_colours: ["#080504", "#854A22", "#C4864F", "#DFDFDE"],
          filament_types: ["PLA Matte", "PLA Basic"],
          layer_height: 0.2,
          nozzle_size: 0.4,
          infill: 5,
        },
        message: LARGE_3MF_QUOTE_THUMBNAIL_MSG,
      });
      return;
    }

    if (layout === "preview-skipped-sliced") {
      const file = new File(["x"], "Photoset_Iphone_support.3mf", { type: "model/3mf" });
      const platePhoto = "/fixtures/plate_1.png";
      setSelectedFile(file);
      setModelPreviewUrl(null);
      setPreviewImageUrl(platePhoto);
      setInfill(15);
      setLayerHeight(0.2);
      setNozzleSize(0.4);
      setSelectedMaterial("PLA_STANDARD");
      applyAmsColours(["#E05028"]);
      setAnalysisData({
        instant_pricing: true,
        skipped_geometry: false,
        skipped_colored_preview: true,
        preview_skipped: true,
        quote_ready: true,
        volume_cm3: 842.1,
        file_key: "layout-photoset-sliced-fixture",
        original_filename: "Photoset_Iphone_support.3mf",
        filament_weight_g: 146.74,
        filament_length_m: 49.2,
        print_time_formatted: "5h 6m",
        print_time_hours: 5.1,
        print_time_seconds: 18372,
        slicer_engine: "bambu-slice-info",
        quote_source: "bambu-slice-info",
        price_breakdown: { unit_price_pln: 20.31 },
        preview_image_url: platePhoto,
        preview_image_source: "Metadata/plate_1.png",
        file_profile: {
          filament_colours: ["#E05028"],
          filament_types: ["PLA Basic"],
          layer_height: 0.2,
          nozzle_size: 0.4,
          infill: 15,
          slice_stats: {
            filament_weight_g: 146.74,
            filament_length_m: 49.2,
            print_time_seconds: 18372,
          },
        },
        message: `${LARGE_3MF_QUOTE_THUMBNAIL_MSG} ${SLICE_INFO_QUOTE_NOTE}`,
      });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchCart(u.id);
        if (u.email) setRfqEmail(u.email);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        fetchCart(u.id);
        if (u.email) setRfqEmail(u.email);
      }
    });

    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  function handleFileInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleSelectedFile(file);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  async function handleSelectedFile(file) {
    if (!file) return;

    setSelectedFile(file);
    setIsAnalyzing(true);
    setAnalysisData(null);
    setAmsColours([]);
    setAmsSlotIndex(0);
    setMaterialPickerOpen(false);
    setColorPickerOpen(false);
    setRfqSubmitted(false);
    setScalePercent(100);
    setScaleOpen(false);
    setPreviewImageUrl(null);
    setEngineerReview(false);

    const lowerName = file.name.toLowerCase();
    const isDirectPreview =
      lowerName.endsWith(".stl") || lowerName.endsWith(".glb") || lowerName.endsWith(".gltf");
    if (isDirectPreview) {
      setModelPreviewUrl(URL.createObjectURL(file));
    } else {
      setModelPreviewUrl(null);
    }

    const formFields = {
      layer_height: String(layerHeight),
      nozzle_size: String(nozzleSize),
      infill: String(infill),
      filament_type: matConfig?.name?.split(" ")[0] || "PLA",
    };
    const buildAnalyzeBody = () => {
      const next = new FormData();
      next.append("file", file);
      next.append("layer_height", formFields.layer_height);
      next.append("nozzle_size", formFields.nozzle_size);
      next.append("infill", formFields.infill);
      next.append("filament_type", formFields.filament_type);
      return next;
    };

    const is3mf = file.name.toLowerCase().endsWith(".3mf");
    let peekedProfile = null;
    let peekedSliceQuote = null;
    if (is3mf) {
      try {
        const peeked = await peek3mfSidecar(file);
        peekedProfile = peeked.profile;
        if (peekedProfile?.filament_types?.length) {
          handleSelectMaterial(materialIdFromFilamentType(peekedProfile.filament_types[0]), {
            preserveColors: true,
          });
        }
        if (peekedProfile?.layer_height) setLayerHeight(peekedProfile.layer_height);
        if (peekedProfile?.nozzle_size) setNozzleSize(peekedProfile.nozzle_size);
        if (peekedProfile?.infill != null) setInfill(peekedProfile.infill);
        if (peekedProfile?.filament_colours?.length) {
          applyAmsColours(peekedProfile.filament_colours);
        }
        if (peeked.preview?.url) setPreviewImageUrl(peeked.preview.url);
        if (canQuoteFromPeekedSliceInfo(peeked.sliceStats, peeked.maxModelUncompressed)) {
          peekedSliceQuote = quoteAnalysisFromPeekedSliceInfo({
            profile: peekedProfile,
            sliceStats: peeked.sliceStats,
            fileName: file.name,
            ratePerG: matConfig?.ratePerG || 0.045,
            previewImageUrl: peeked.preview?.url || null,
          });
          if (peekedSliceQuote) setAnalysisData(peekedSliceQuote);
        } else if (peekedProfile?.filament_colours?.length) {
          setAnalysisData({ file_profile: peekedProfile });
        }
      } catch (peekErr) {
        console.warn("Nie udało się odczytać profilu 3MF z pliku:", peekErr);
      }
    }

    if (is3mf && !peekedSliceQuote) {
      try {
        const jobBody = new FormData();
        jobBody.append("file", file);
        jobBody.append("layer_height", formFields.layer_height);
        jobBody.append("nozzle_size", formFields.nozzle_size);
        jobBody.append("infill", formFields.infill);
        jobBody.append(
          "filament_type",
          peekedProfile?.filament_types?.[0] || formFields.filament_type
        );
        jobBody.append("color_count", String(Math.max(peekedProfile?.filament_colours?.length || 1, 1)));
        jobBody.append("support_needed", String(peekedProfile?.support_enabled !== false));
        jobBody.append(
          "painted_ratio",
          String(
            Number(peekedProfile?.painted_ratio) ||
              (Math.max(peekedProfile?.filament_colours?.length || 1, 1) >= 2 ? 0.66 : 0)
          )
        );
        const jobResponse = await fetch(`${API_URL || ""}/api/slice-jobs`, {
          method: "POST",
          body: jobBody,
        });
        const job = await jobResponse.json();
        if (!jobResponse.ok) throw new Error(job.detail || "Nie udało się uruchomić slicowania.");
        setAnalysisData({
          instant_pricing: false,
          quote_ready: false,
          original_filename: file.name,
          file_profile: peekedProfile || {},
          message: "Slicowanie modelu trwa w tle. Cena pojawi się po zakończeniu.",
        });
        for (let attempt = 0; attempt < 90; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusResponse = await fetch(`${API_URL || ""}/api/slice-jobs/${job.job_id}`);
          const status = await statusResponse.json();
          if (status.status === "done") {
            setAnalysisData({
              ...status.result,
              instant_pricing: true,
              quote_ready: true,
              original_filename: file.name,
              file_profile: peekedProfile || {},
              message: "Wycena gotowa. Waga i czas z OrcaSlicera.",
            });
            return;
          }
          if (status.status === "failed") {
            throw new Error(status.error || "OrcaSlicer nie zakończył cięcia.");
          }
        }
        throw new Error("Slicowanie trwa dłużej niż oczekiwano.");
      } catch (jobError) {
        console.warn("Błąd zadania slicowania:", jobError);
        setAnalysisData({
          instant_pricing: false,
          quote_ready: false,
          original_filename: file.name,
          file_profile: peekedProfile || {},
          message: `Nie udało się zakończyć automatycznego slicowania: ${jobError.message}`,
        });
      } finally {
        setIsAnalyzing(false);
      }
      return;
    }

    // Railway zrywa HTTP ~60 s. Jedna próba 50 s × 3 dla 3MF; FormData od nowa.
    // Sukces (nawet wolny JSON) nigdy nie jest traktowany jako „za duży plik”.
    try {
      const res = await fetchAnalyzeModelWithRetry({
        url: `${API_URL || ""}/api/analyze-model`,
        buildBody: buildAnalyzeBody,
        is3mf,
      });

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw?.slice(0, 180) || "Serwer analizy zwrócił nieczytelną odpowiedź.");
      }

      if (!res.ok) {
        const httpErr = new Error(data.detail || data.message || "Błąd analizy modelu.");
        httpErr.status = res.status;
        throw httpErr;
      }
      setAnalysisData(mergeAnalyzeWithPeekedSliceQuote({
        ...data,
        source_dimensions_mm: data.dimensions_mm,
        source_volume_cm3: data.volume_cm3,
        source_surface_area_cm2: data.surface_area_cm2,
      }, peekedSliceQuote));

      if (data.file_profile) {
        const p = data.file_profile;
        if (p.filament_types?.length) {
          handleSelectMaterial(materialIdFromFilamentType(p.filament_types[0]), {
            preserveColors: true,
          });
        }
        if (p.layer_height) setLayerHeight(p.layer_height);
        if (p.nozzle_size) setNozzleSize(p.nozzle_size);
        if (p.infill != null) setInfill(p.infill);
        if (p.filament_colours?.length) {
          applyAmsColours(p.filament_colours);
        }
      } else if (data.filament_colours?.length) {
        applyAmsColours(data.filament_colours);
      }

      const keepNativeGltf =
        /\.(glb|gltf)$/i.test(file.name) && !data.has_file_colors;
      if (data.instant_pricing && data.preview_glb_url) {
        setModelPreviewUrl(resolveAssetUrl(data.preview_glb_url));
      } else if (data.instant_pricing && data.preview_stl_url && !keepNativeGltf) {
        setModelPreviewUrl(resolveAssetUrl(data.preview_stl_url));
      } else if (!data.instant_pricing) {
        setModelPreviewUrl(null);
      }
      if (data.preview_image_url) {
        setPreviewImageUrl(resolveAssetUrl(data.preview_image_url));
      }
      const previewUrl = data.preview_glb_url || data.preview_stl_url || null;
      logAnalyzeAttempt({
        file: file.name,
        ok: true,
        engine: data.slicer_engine || data.quote_source || null,
        weight: data.filament_weight_g,
        preview: previewUrl ? (data.preview_glb_url ? "glb" : "stl") : "none",
        reason: analyzeClientOutcome({
          ok: true,
          instantPricing: data.instant_pricing,
          quoteReady: data.quote_ready,
          previewUrl,
          peekedQuote: peekedSliceQuote,
        }),
      });
    } catch (err) {
      console.error("Błąd zapytania analizy:", err);
      const isAbort = err?.name === "AbortError";
      const isNetworkErr = err.message === "Failed to fetch" || err.name === "TypeError";
      const retryableHttp = [408, 429, 502, 503, 504].includes(Number(err?.status));
      const errorMsg = isAbort
        ? "Analiza gęstego pliku 3MF trwa dłużej niż zwykle. Spróbuj ponownie za chwilę."
        : isNetworkErr || retryableHttp
        ? "Nie udało się połączyć z serwerem analizy (limit czasu albo chwilowa awaria). Spróbuj ponownie albo wyślij plik do wyceny inżynierskiej."
        : `Błąd analizy pliku: ${err.message}`;
      const outcome = analyzeClientOutcome({
        ok: false,
        peekedQuote: peekedSliceQuote,
      });
      logAnalyzeAttempt({
        file: file.name,
        ok: false,
        reason: outcome,
        message: err?.message,
      });
      if ((isAbort || isNetworkErr || retryableHttp) && is3mf) {
        if (peekedSliceQuote) {
          setAnalysisData(peekedSliceQuote);
          return;
        }
        setAnalysisData({
          instant_pricing: false,
          type: "rfq_document",
          category: "Model 3D (analiza przekroczona)",
          preview_skipped: true,
          quote_ready: false,
          message: ANALYZE_TIMEOUT_RFQ_MSG,
          file_profile: peekedProfile || {},
          original_filename: file.name,
        });
        return;
      }
      alert(errorMsg);
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSubmitRfq(e) {
    if (e) e.preventDefault();
    const targetEmail = rfqEmail || user?.email;
    if (!targetEmail) {
      alert("Proszę podać adres e-mail, abyśmy mogli przesłać kalkulację.");
      return;
    }

    setRfqSubmitting(true);
    try {
      const fileName = selectedFile?.name || analysisData?.original_filename || "Dokumentacja RFQ";
      const categoryName = analysisData?.category || "RFQ";

      try {
        await createRfqOrder({
          file_name: `[RFQ] ${fileName} (${categoryName})`,
          material: `Wycena Inżynierska: ${categoryName}`,
          technology: `Wycena 24h: ${rfqName || "Klient"} (${targetEmail}${rfqPhone ? ", tel: " + rfqPhone : ""}) | Ilość: ${rfqQuantity} szt. | Uwagi: ${rfqNotes || "Brak uwag"}`,
          layer_height: "Wg specyfikacji",
          infill: 0,
          clean_supports: false,
          brass_inserts: false,
          quantity: parseInt(rfqQuantity) || 1,
          total_price: 0.0,
          dimensions_mm: [0, 0, 0],
          status: "rfq_pending",
        });
      } catch (error) {
        console.warn("Błąd zapisu RFQ w bazie:", error);
      }
      setRfqSubmitted(true);
    } catch (err) {
      console.error("Błąd zapisu RFQ:", err);
      setRfqSubmitted(true);
    } finally {
      setRfqSubmitting(false);
    }
  }

  function handleResetFile() {
    setSelectedFile(null);
    setAnalysisData(null);
    setModelPreviewUrl(null);
    setPreviewImageUrl(null);
    setAmsColours([]);
    setAmsSlotIndex(0);
    setRfqSubmitted(false);
    setQuantity(1);
    setScalePercent(100);
    setScaleOpen(false);
    setEngineerReview(false);
    setMaterialPickerOpen(false);
    setColorPickerOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Dynamiczne ponowne cięcie modelu (reslicing) przy zmianie infill, layerHeight lub materiału
  useEffect(() => {
    if (!analysisData || analysisData.instant_pricing === false) return;
    // 3MF: waga/czas ze slicera — materiał tylko przelicza cenę na froncie
    if (
      analysisData.file_profile ||
      /\.3mf$/i.test(String(analysisData.original_filename || selectedFile?.name || ""))
    ) {
      return;
    }
    const modelKey = analysisData.preview_stl_key || analysisData.file_key;
    if (!modelKey) return;

    const timer = setTimeout(async () => {
      setIsReslicing(true);
      try {
        const res = await fetch(`${API_URL || ""}/api/reslice-model`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preview_stl_key: analysisData.preview_stl_key,
            file_key: analysisData.file_key,
            layer_height: parseFloat(layerHeight),
            nozzle_size: parseFloat(nozzleSize),
            infill: parseInt(infill),
            filament_type: matConfig?.slicerType || matConfig?.name?.split(" ")[0] || "PLA",
            quantity: quantity,
            color_count: Math.max(
              Number(analysisData.color_count) || 0,
              (analysisData.filament_colours || []).length,
              1
            ),
            painted_ratio: Number(analysisData.painted_ratio) || 0,
            support_needed: analysisData.file_profile?.support_enabled !== false,
            volume_cm3: analysisData.source_volume_cm3 ?? analysisData.volume_cm3,
            surface_area_cm2: analysisData.source_surface_area_cm2 ?? analysisData.surface_area_cm2,
            dimensions_mm: analysisData.source_dimensions_mm || analysisData.dimensions_mm,
            triangle_count: analysisData.triangle_count,
            scale: modelScale,
          }),
        });

        if (res.ok) {
          const resliceData = await res.json();
          setAnalysisData((prev) => ({
            ...prev,
            print_time_hours: resliceData.print_time_hours,
            print_time_formatted: resliceData.print_time_formatted,
            filament_weight_g: resliceData.filament_weight_g,
            filament_length_m: resliceData.filament_length_m,
            filament_volume_cm3: resliceData.filament_volume_cm3,
            flush_cm3: resliceData.flush_cm3,
            support_cm3: resliceData.support_cm3,
            layer_height: resliceData.layer_height,
            nozzle_size: resliceData.nozzle_size,
            infill: resliceData.infill,
            has_supports: resliceData.has_supports,
            support_lines: resliceData.support_lines?.length > 0 ? resliceData.support_lines : prev.support_lines,
            slicer_engine: resliceData.engine,
            price_breakdown: resliceData.price_breakdown,
            quote_ready: resliceData.quote_ready !== false,
            instant_pricing: resliceData.quote_ready !== false,
          }));
        } else {
          console.warn("Reslice nie zwrócił poprawnej wyceny:", res.status);
        }
      } catch (err) {
        console.warn("Błąd reslicowania:", err);
      } finally {
        setIsReslicing(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [layerHeight, nozzleSize, infill, selectedMaterial, modelScale, analysisData?.preview_stl_key, analysisData?.color_count, analysisData?.painted_ratio]);

  const volume = studioVolumeCm3(analysisData, modelScale);
  const sourceDimsMm = sourceDimensionsMm(analysisData);
  const scaledDimsMm = scaledDimensionsMm(sourceDimsMm, modelScale);
  const isOversized = isQuotedModel(analysisData) && isOverPrintBed(scaledDimsMm);
  const fitPercent = fitToPrintBedPercent(sourceDimsMm);
  const matConfig = materialById(selectedMaterial);
  const selectedFamily = familyForMaterial(matConfig);
  const materialCaption =
    matConfig?.subtypeLabel && matConfig.subtypeLabel !== "Standard" && matConfig.subtypeLabel !== "95A"
      ? `${matConfig.familyName || selectedFamily?.name} · ${matConfig.subtypeLabel}`
      : matConfig?.familyName || selectedFamily?.name || matConfig?.name;
  const colorMaterialLabel = materialCaption;
  const activeColorObj =
    matConfig?.colors?.find((c) => String(c.hex).toLowerCase() === String(selectedColor).toLowerCase()) ||
    matConfig?.colors?.[0];
  const displayAmsColours = useMemo(() => {
    if (amsColours.length) return amsColours;
    return normalizeAmsColours(
      analysisData?.file_profile?.filament_colours || analysisData?.filament_colours || []
    );
  }, [amsColours, analysisData?.filament_colours, analysisData?.file_profile?.filament_colours]);
  const analysisForViewer = useMemo(() => {
    if (!analysisData) return analysisData;
    if (!displayAmsColours.length) return analysisData;
    return {
      ...analysisData,
      filament_colours: displayAmsColours,
      file_profile: {
        ...(analysisData.file_profile || {}),
        filament_colours: displayAmsColours,
      },
    };
  }, [analysisData, displayAmsColours]);
  const quoteWeightG = useMemo(() => {
    const raw = Number(analysisData?.filament_weight_g) || 0;
    if (raw <= 0) return 0;
    const is3mfQuote =
      Boolean(analysisData?.file_profile) ||
      /\.3mf$/i.test(String(analysisData?.original_filename || selectedFile?.name || ""));
    if (!is3mfQuote) return raw;
    return scaleWeightForDensity(raw, matConfig?.density);
  }, [
    analysisData?.filament_weight_g,
    analysisData?.file_profile,
    analysisData?.original_filename,
    selectedFile?.name,
    matConfig?.density,
  ]);
  const quoteLengthM = useMemo(() => {
    const raw = Number(analysisData?.filament_length_m) || 0;
    if (raw <= 0) return 0;
    const is3mfQuote =
      Boolean(analysisData?.file_profile) ||
      /\.3mf$/i.test(String(analysisData?.original_filename || selectedFile?.name || ""));
    if (!is3mfQuote) return raw;
    return scaleLengthForDensity(raw, matConfig?.density);
  }, [
    analysisData?.filament_length_m,
    analysisData?.file_profile,
    analysisData?.original_filename,
    selectedFile?.name,
    matConfig?.density,
  ]);
  const isNozzle02 = Math.abs(nozzleSize - 0.2) < 0.05;
  const layerMultiplier = isNozzle02
    ? (Math.abs(layerHeight - 0.08) < 0.02 ? 1.30 : Math.abs(layerHeight - 0.12) < 0.02 ? 1.15 : 1.0)
    : (Math.abs(layerHeight - 0.12) < 0.02 ? 1.25 : Math.abs(layerHeight - 0.28) < 0.02 ? 0.90 : 1.0);
  const nozzleMultiplier = isNozzle02 ? 1.65 : 1.0;
  
  // Obliczenie wagi i ceny bazowej (dla 1 sztuki bez rabatu)
  const baseUnitPrice = useMemo(() => {
    const quoteHasMeasurements =
      analysisData?.quote_ready !== false &&
      quoteWeightG > 0 &&
      (Number(analysisData?.print_time_hours) > 0 ||
        Number(analysisData?.print_time_seconds) > 0 ||
        Boolean(analysisData?.print_time_formatted));
    if (!quoteHasMeasurements) return null;
    const ratePerG = matConfig?.ratePerG || (matConfig?.pricePerKg || 45) / 1000;
    return quoteUnitPriceFromWeight({
      weightG: quoteWeightG,
      volumeCm3: volume,
      infill,
      density: matConfig?.density || 1.24,
      ratePerG,
      layerMultiplier,
      nozzleMultiplier,
      printTimeHours: analysisData?.print_time_hours,
      printTimeFormatted: analysisData?.print_time_formatted,
      printTimeSeconds:
        analysisData?.print_time_seconds ||
        analysisData?.file_profile?.slice_stats?.print_time_seconds,
    });
  }, [
    quoteWeightG,
    analysisData?.print_time_hours,
    analysisData?.print_time_formatted,
    analysisData?.print_time_seconds,
    analysisData?.file_profile?.slice_stats?.print_time_seconds,
    analysisData?.quote_ready,
    volume,
    matConfig,
    infill,
    layerMultiplier,
    nozzleMultiplier,
  ]);

  // Czysta liniowa cena bez rabatów ilościowych
  const unitPrice = baseUnitPrice == null ? null : (Math.round(baseUnitPrice * 100) / 100).toFixed(2);
  const totalPrice = unitPrice == null ? null : (parseFloat(unitPrice) * quantity).toFixed(2);

  // Weryfikacja wgranego modelu – ukrycie ceny i blokada koszyka przed analizą
  const hasModel = isQuotedModel(analysisData) && unitPrice != null;
  const isRfq = Boolean(
    analysisData &&
    !isAnalyzing &&
    !hasModel &&
    (
      analysisData.instant_pricing === false ||
      analysisData.quote_ready === false ||
      Boolean(analysisData.file_profile)
    )
  );
  const fromSliceInfo = isBambuSliceQuote(analysisData);
  const previewUnavailable = isPreviewSkipped(analysisData, modelPreviewUrl);
  const embeddedPreviewUrl = studioPreviewImageUrl(analysisData, previewImageUrl);
  const isEmptyStage = !selectedFile && !analysisData && !isAnalyzing;
  const MIN_ORDER_VALUE = MINIMUM_ORDER_VALUE_PLN;
  const isBelowMoq = hasModel && parseFloat(totalPrice) < MIN_ORDER_VALUE;
  const diffToMoq = hasModel ? (MIN_ORDER_VALUE - parseFloat(totalPrice)).toFixed(2) : null;
  const suggestedQtyForMoq = hasModel
    ? Math.max(1, Math.ceil(MIN_ORDER_VALUE / Math.max(0.1, parseFloat(unitPrice))))
    : 1;

  // Rekomendowane zastosowania dla karty specyfikacji technicznej
  const recommendedApps = useMemo(() => {
    const id = matConfig?.id || "";
    const group = matConfig?.group || "";

    if (id.includes("FR")) {
      return ["Szafy sterownicze i aparatura modułowa", "Obudowy elektroniki z atestem UL94 V-0", "Części zasilaczy i automatyki przemysłowej", "Elementy szyn DIN i złącza"];
    }
    if (id.includes("ASA")) {
      return ["Elementy zewnętrzne i outdoor", "Części motoryzacyjne", "Obudowy czujników i kamer", "Uchwyty paneli solarnych"];
    }
    if (id.includes("PLA")) {
      return ["Prototypy koncepcyjne", "Obudowy urządzeń domowych", "Makiety architektoniczne", "Figurki i detale o wysokiej precyzji"];
    }
    if (id.includes("PCTG")) {
      return ["Elementy uderzeniowe i ochronne", "Osłony maszyn i dozowniki", "Uchwyty o wysokiej trwałości dynamicznej", "Zastosowania wymagające udarności"];
    }
    if (id.includes("PETG")) {
      return ["Uchwyty użytkowe i narzędzia", "Elementy odporne na wilgoć", "Pojemniki i obudowy szczelne", "Części maszyn i osłony"];
    }
    if (id.includes("ABS")) {
      return ["Elementy o wysokiej udarności", "Obudowy elektroniki przemysłowej", "Adaptery i złączki warsztatowe", "Części narażone na obciążenia"];
    }
    if (id.includes("CF") || id.includes("PA12")) {
      return ["Ramiona dronów i robotyka", "Elementy konstrukcyjne o skrajnej sztywności", "Części motorsport i wyczynowe", "Szablony produkcyjne i formy"];
    }
    if (group === "flex" || id.includes("TPU")) {
      return ["Uszczelki i dławiki", "Odbojniki i amortyzatory drgań", "Elastyczne chwytaki i osłony", "Etui ochronne"];
    }
    return ["Prototypy inżynieryjne", "Elementy użytkowe", "Obudowy", "Części zamienne"];
  }, [matConfig]);

  // Odporność chemiczna
  const chemicalResistance = useMemo(() => {
    const id = matConfig?.id || "";
    const group = matConfig?.group || "";
    if (id.includes("PP")) return "Ekstremalna (Kwasy, zasady, rozpuszczalniki)";
    if (id.includes("FR") || id.includes("PETG") || id.includes("PCTG") || id.includes("ASA")) return "Wysoka (Oleje, smary, woda, chemia myjąca)";
    if (id.includes("PA12") || id.includes("CF")) return "Wysoka (Środowisko przemysłowe i paliwa)";
    if (group === "flex" || id.includes("TPU")) return "Dobra (Tłuszcze, oleje mineralne)";
    if (id.includes("ABS")) return "Dobra (Alkohole, zasady, oleje)";
    return "Standardowa (Odporność domowa)";
  }, [matConfig]);

  const isLocked3mf = Boolean(
    analysisData?.file_profile ||
      String(selectedFile?.name || analysisData?.original_filename || "").toLowerCase().endsWith(".3mf")
  );

  async function handleAddToCart() {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    if (isOversized) {
      setScaleOpen(true);
      return;
    }
    if (isBelowMoq) {
      return;
    }

    setAddingToCart(true);
    try {
      const newOrder = await createOrder({
        file_name: selectedFile?.name || "Model 3D STL",
        material: isLocked3mf
          ? formatAmsMaterialLabel(matConfig.name || "PLA", displayAmsColours)
          : `${matConfig.name} (${activeColorObj?.name || selectedColor})`,
        technology: `${
          matConfig.group === "composite"
            ? "FDM Hardened Steel 0.4mm (Carbon)"
            : matConfig.group === "flex"
            ? "FDM Direct Drive 0.4mm (Flex TPU)"
            : `FDM Precision ${nozzleSize}mm`
        }${analysisData?.print_time_formatted ? ` | Czas: ${analysisData.print_time_formatted}` : ""}${
          quoteWeightG ? ` | Waga: ${quoteWeightG}g` : ""
        }${
          displayAmsColours.length > 1
            ? ` | AMS: ${displayAmsColours.join(", ")}`
            : ""
        }${scalePercent !== 100 ? ` | Skala: ${scalePercent}%` : ""}${
          engineerReview ? " | Weryfikacja inżyniera przed drukiem" : ""
        }`,
        layer_height: `${layerHeight} mm`,
        infill: infill,
        clean_supports: true,
        brass_inserts: false,
        quantity: quantity,
        filament_weight_g: quoteWeightG || null,
        print_time_hours: canonicalPrintTimeHours({
          formatted: analysisData?.print_time_formatted,
          hours: analysisData?.print_time_hours,
          seconds:
            analysisData?.print_time_seconds ||
            analysisData?.file_profile?.slice_stats?.print_time_seconds,
        }),
        print_time_formatted: analysisData?.print_time_formatted || null,
        print_time_seconds:
          Number(
            analysisData?.print_time_seconds ||
              analysisData?.file_profile?.slice_stats?.print_time_seconds
          ) || null,
        total_price: parseFloat(totalPrice),
        dimensions_mm: (sourceDimsMm.some((v) => v > 0) ? scaledDimsMm : [60, 60, 40]).map(
          (v) => Number(Number(v).toFixed(2))
        ),
        status: "in_cart",
        nozzle_size: String(nozzleSize || "0.4"),
      });

      // W tle: wygenerowanie pakietu produkcyjnego .3MF (backend zapisuje URL w Railway)
      if (newOrder?.id && (analysisData?.preview_stl_key || analysisData?.file_key)) {
        const modelKey = analysisData.preview_stl_key || analysisData.file_key;
        authHeaders({ "Content-Type": "application/json" }).then((headers) =>
          fetch(`${API_URL || ""}/api/generate-3mf`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              order_id: newOrder.id,
              preview_stl_key: analysisData.preview_stl_key || null,
              file_key: analysisData.file_key || null,
              model_key: modelKey,
              file_name: selectedFile?.name || "model.stl",
              material: matConfig.name || "PLA",
              color_hex: displayAmsColours[0] || activeColorObj?.hex || "#EF4444",
              filament_colours: displayAmsColours,
              layer_height: parseFloat(String(layerHeight || "0.2").replace(/[^\d.]/g, "")) || 0.2,
              infill: parseInt(String(infill || "20").replace(/[^\d.]/g, "")) || 20,
              nozzle_size: parseFloat(String(nozzleSize || "0.4").replace(/[^\d.]/g, "")) || 0.4,
              scale: modelScale,
            }),
          })
        ).catch((e) => console.warn("Background 3MF generation:", e));
      }
      await fetchCart(user.id);
      setIsCartOpen(true);
    } catch (err) {
      alert("Błąd koszyka: " + err.message);
    } finally {
      setAddingToCart(false);
    }
  }

  const colorWheelItems = (matConfig?.colors || []).map((c) => ({
    id: c.id || c.hex,
    hex: c.hex,
    name: c.name,
    gradient: c.gradient,
    colors: c.colors,
  }));
  const materialWheelItems = studioFamiliesForWheel();
  const printParamWheelItems = [
    { id: "nozzle", hex: "#2A2A2A", name: `${nozzleSize} mm` },
    { id: "layer", hex: "#E11D2A", name: `${Number(layerHeight).toFixed(2)} mm` },
    { id: "infill", hex: "#D4D4D4", name: `${infill}%` },
  ];
  const fileProfile = analysisData?.file_profile || {};

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans">
      <Head>
        <title>drukstacja — wycena druku 3D</title>
      </Head>

      <Navbar
        activePage="wycena"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".stl,.step,.stp,.obj,.3mf,.iges,.igs,.ply,.glb,.gltf,.off,.3ds,.dxf,.dwg,.pdf,.zip,.rar,.7z,.kicad_pcb,.pcbdoc,.brd,.gbr,.ger,.gtl,.gbl,.gts,.gbs,.drl,.fcstd,.ifc,.3dm,.png,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileInputChange}
      />

      <PrinterLayersBand onUploadClick={openFilePicker} />

      <section
        id="configurator"
        className="relative scroll-mt-20 bg-zinc-950"
        onDragOver={(e) => {
          if (selectedFile || isAnalyzing || analysisData) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (selectedFile || isAnalyzing || analysisData) return;
          e.preventDefault();
          const file = e.dataTransfer?.files?.[0];
          if (file) handleSelectedFile(file);
        }}
      >

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 pt-3 sm:pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {analysisData && analysisData.instant_pricing === false
                  ? "Wycena inżynierska"
                  : "Konfigurator druku"}
              </p>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-zinc-50 mt-0.5">
                {selectedFile ? selectedFile.name : "Wgraj model do wyceny"}
              </h1>
            </div>
            {selectedFile && (
              <button
                type="button"
                onClick={handleResetFile}
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-200 ring-1 ring-zinc-700 hover:bg-zinc-700"
              >
                Zmień plik
              </button>
            )}
          </div>
        </div>

        {/* Stage + quote bar share one surface so the sticky strip is not a fourth layer. */}
        <div
          data-studio-surface
          className="studio-surface relative mx-3 mb-3 flex flex-col rounded-2xl bg-zinc-900 ring-1 ring-zinc-800 sm:mx-4"
        >
          <div data-studio-stage className="studio-stage">
          <StudioControlRail
            empty={isEmptyStage}
            framed={!isLocked3mf}
            pickerOpen={materialPickerOpen || colorPickerOpen || printParamsOpen || scaleOpen}
          >
            {isLocked3mf ? (
              <div className="relative z-[80] overflow-visible pointer-events-auto" ref={materialPickerRef}>
                <div ref={colorPickerRef}>
                  <StudioFileProfile
                    colours={displayAmsColours}
                    filamentTypes={fileProfile.filament_types || []}
                    layerHeight={fileProfile.layer_height || layerHeight}
                    nozzleSize={fileProfile.nozzle_size || nozzleSize}
                    infill={fileProfile.infill ?? infill}
                    fromSliceInfo={fromSliceInfo}
                    editable
                    materialLabel={materialCaption}
                    onSelectSlot={openAmsSlotPicker}
                    onOpenMaterial={openAmsMaterialPicker}
                  />
                </div>
                {materialPickerOpen && isMdUp ? (
                  <div className="absolute top-0 left-full z-[90] ml-3">
                    <StudioMaterialPicker
                      families={STUDIO_FAMILIES}
                      selectedFamilyId={selectedFamily?.id}
                      selectedSubtypeId={selectedMaterial}
                      surface="popover"
                      onSelectSubtype={handleSelectMaterialFor3mf}
                    />
                  </div>
                ) : null}
                <StudioMobileSheet
                  open={materialPickerOpen && !isMdUp}
                  onClose={() => setMaterialPickerOpen(false)}
                  closeLabel="Zamknij wybór materiału"
                  panelRef={materialSheetRef}
                >
                  <StudioMaterialPicker
                    families={STUDIO_FAMILIES}
                    selectedFamilyId={selectedFamily?.id}
                    selectedSubtypeId={selectedMaterial}
                    surface="sheet"
                    onSelectSubtype={handleSelectMaterialFor3mf}
                  />
                </StudioMobileSheet>
                {colorPickerOpen && isMdUp ? (
                  <div className="absolute bottom-0 left-full z-[90] ml-3">
                    <StudioColorPicker
                      colors={colorWheelItems}
                      value={displayAmsColours[amsSlotIndex] || selectedColor}
                      materialName={`${colorMaterialLabel} · AMS ${amsSlotIndex + 1}`}
                      surface="popover"
                      onSelect={handleSelectAmsSlotColor}
                    />
                  </div>
                ) : null}
                <StudioMobileSheet
                  open={colorPickerOpen && !isMdUp}
                  onClose={() => setColorPickerOpen(false)}
                  closeLabel="Zamknij wybór koloru AMS"
                  panelRef={colorSheetRef}
                >
                  <StudioColorPicker
                    colors={colorWheelItems}
                    value={displayAmsColours[amsSlotIndex] || selectedColor}
                    materialName={`${colorMaterialLabel} · AMS ${amsSlotIndex + 1}`}
                    surface="sheet"
                    onSelect={handleSelectAmsSlotColor}
                  />
                </StudioMobileSheet>
              </div>
            ) : (
              <>
                <div className="relative z-[80] overflow-visible" ref={materialPickerRef}>
                  <StudioWheel
                    items={materialWheelItems}
                    value={selectedFamily?.id}
                    expanded={materialPickerOpen}
                    onOpen={() => {
                      closeOtherStudioPickers("material");
                      setMaterialPickerOpen((open) => !open);
                    }}
                    size={isEmptyStage ? 42 : 48}
                    muted={isEmptyStage}
                    label="Materiał"
                    caption={materialCaption}
                  />
                  {materialPickerOpen && isMdUp ? (
                    <div className="absolute top-0 left-full z-[90] ml-3">
                      <StudioMaterialPicker
                        families={STUDIO_FAMILIES}
                        selectedFamilyId={selectedFamily?.id}
                        selectedSubtypeId={selectedMaterial}
                        surface="popover"
                        onSelectSubtype={handleSelectMaterialFromPicker}
                      />
                    </div>
                  ) : null}
                  <StudioMobileSheet
                    open={materialPickerOpen && !isMdUp}
                    onClose={() => setMaterialPickerOpen(false)}
                    closeLabel="Zamknij wybór materiału"
                    panelRef={materialSheetRef}
                  >
                    <StudioMaterialPicker
                      families={STUDIO_FAMILIES}
                      selectedFamilyId={selectedFamily?.id}
                      selectedSubtypeId={selectedMaterial}
                      surface="sheet"
                      onSelectSubtype={handleSelectMaterialFromPicker}
                    />
                  </StudioMobileSheet>
                </div>
                <div className="relative z-[80] overflow-visible" ref={colorPickerRef}>
                  <StudioWheel
                    items={colorWheelItems}
                    value={selectedColor}
                    expanded={colorPickerOpen}
                    onOpen={() => {
                      closeOtherStudioPickers("color");
                      setColorPickerOpen((open) => !open);
                    }}
                    size={isEmptyStage ? 42 : 48}
                    muted={isEmptyStage}
                    label="Kolor"
                  />
                  {colorPickerOpen && isMdUp ? (
                    <div className="absolute bottom-0 left-full z-[90] ml-3">
                      <StudioColorPicker
                        colors={colorWheelItems}
                        value={selectedColor}
                        materialName={colorMaterialLabel}
                        surface="popover"
                        onSelect={handleSelectColor}
                      />
                    </div>
                  ) : null}
                  <StudioMobileSheet
                    open={colorPickerOpen && !isMdUp}
                    onClose={() => setColorPickerOpen(false)}
                    closeLabel="Zamknij wybór koloru"
                    panelRef={colorSheetRef}
                  >
                    <StudioColorPicker
                      colors={colorWheelItems}
                      value={selectedColor}
                      materialName={colorMaterialLabel}
                      surface="sheet"
                      onSelect={handleSelectColor}
                    />
                  </StudioMobileSheet>
                </div>
                <div className="relative z-[80] overflow-visible" ref={printParamsRef}>
                  <StudioWheel
                    items={printParamWheelItems}
                    expanded={printParamsOpen}
                    onOpen={() => {
                      closeOtherStudioPickers("params");
                      setPrintParamsOpen((open) => !open);
                    }}
                    size={isEmptyStage ? 42 : 48}
                    muted={isEmptyStage}
                    label="Parametry"
                    caption={`${nozzleSize} · ${Number(layerHeight).toFixed(2)} · ${infill}%`}
                  />
                  {printParamsOpen && isMdUp ? (
                    <div className="absolute bottom-0 left-full z-[90] ml-3">
                      <StudioPrintParams
                        nozzleSize={nozzleSize}
                        setNozzleSize={setNozzleSize}
                        isPlaMaterial={isPlaMaterial}
                        layerHeight={layerHeight}
                        setLayerHeight={setLayerHeight}
                        layerHeightOptions={layerHeightOptions}
                        infill={infill}
                        setInfill={setInfill}
                        infillOptions={[10, 20, 40, 60, 100]}
                        surface="popover"
                      />
                    </div>
                  ) : null}
                  <StudioMobileSheet
                    open={printParamsOpen && !isMdUp}
                    onClose={() => setPrintParamsOpen(false)}
                    closeLabel="Zamknij parametry druku"
                    panelRef={printParamsSheetRef}
                  >
                    <StudioPrintParams
                      nozzleSize={nozzleSize}
                      setNozzleSize={setNozzleSize}
                      isPlaMaterial={isPlaMaterial}
                      layerHeight={layerHeight}
                      setLayerHeight={setLayerHeight}
                      layerHeightOptions={layerHeightOptions}
                      infill={infill}
                      setInfill={setInfill}
                      infillOptions={[10, 20, 40, 60, 100]}
                      surface="sheet"
                    />
                  </StudioMobileSheet>
                </div>
                <div className="relative z-[80] overflow-visible" ref={scaleParamsRef}>
                  <StudioWheel
                    items={[
                      { id: "s10", hex: "#E5E5E5", name: "10%" },
                      { id: "s25", hex: "#A3A3A3", name: "25%" },
                      { id: "s50", hex: "#525252", name: "50%" },
                      { id: "s100", hex: "#111111", name: "100%" },
                    ]}
                    value={
                      scalePercent <= 17 ? "s10" : scalePercent <= 37 ? "s25" : scalePercent <= 75 ? "s50" : "s100"
                    }
                    expanded={scaleOpen}
                    onOpen={() => {
                      closeOtherStudioPickers("scale");
                      setScaleOpen((open) => !open);
                    }}
                    size={isEmptyStage ? 42 : 48}
                    muted={isEmptyStage}
                    label="Skala"
                    caption={`${scalePercent}%`}
                  />
                  {scaleOpen && isMdUp ? (
                    <div className="absolute bottom-0 left-full z-[90] ml-3">
                      <StudioScale
                        scalePercent={scalePercent}
                        setScalePercent={setScalePercent}
                        sourceDimensionsMm={
                          analysisData?.source_dimensions_mm || analysisData?.dimensions_mm || [0, 0, 0]
                        }
                        surface="popover"
                      />
                    </div>
                  ) : null}
                  <StudioMobileSheet
                    open={scaleOpen && !isMdUp}
                    onClose={() => setScaleOpen(false)}
                    closeLabel="Zamknij skalę modelu"
                    panelRef={scaleSheetRef}
                  >
                    <StudioScale
                      scalePercent={scalePercent}
                      setScalePercent={setScalePercent}
                      sourceDimensionsMm={
                        analysisData?.source_dimensions_mm || analysisData?.dimensions_mm || [0, 0, 0]
                      }
                      surface="sheet"
                    />
                  </StudioMobileSheet>
                </div>
              </>
            )}
          </StudioControlRail>

          <div className="relative flex min-h-[420px] w-full items-center justify-center md:pl-[96px] lg:min-h-[500px] lg:pr-[320px]">
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3 bg-zinc-900/90 p-6 rounded-3xl shadow-sm border border-zinc-700 backdrop-blur-sm">
                  <div className="w-10 h-10 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-zinc-300">
                    Analizuję strukturę pliku i geometrię produkcyjną...
                  </span>
                </div>
              ) : modelPreviewUrl ? (
                <CadViewer3D
                  studio
                  modelUrl={modelPreviewUrl}
                  fileName={selectedFile?.name || "model.stl"}
                  analysisData={analysisForViewer}
                  selectedColor={selectedColor}
                  onColorChange={(newHex) => setSelectedColor(newHex)}
                  materialConfig={matConfig}
                  availableColors={matConfig?.colors || []}
                  showSupportsDefault={showSupports}
                  modelScale={modelScale}
                />
              ) : embeddedPreviewUrl && (previewUnavailable || analysisData) ? (
                <StudioPreviewUnavailable
                  message={analysisData?.message}
                  quoteReady={hasModel}
                  imageUrl={embeddedPreviewUrl}
                  fromSliceInfo={fromSliceInfo}
                />
              ) : previewUnavailable ? (
                <StudioPreviewUnavailable
                  message={analysisData?.message}
                  quoteReady={hasModel}
                  fromSliceInfo={fromSliceInfo}
                />
              ) : analysisData && analysisData.instant_pricing === false ? (
                /* KARTA DOKUMENTACJI TECHNICZNEJ / PCB / RFQ (STANDARD JLCPCB / PCBWAY) */
                <div className="w-full max-w-lg bg-zinc-900/95 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-zinc-700 shadow-[0_15px_35px_rgba(0,0,0,0.35)] space-y-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md">
                        {analysisData.category?.includes("PCB") ? (
                          <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                        ) : analysisData.category?.includes("Rysunek") ? (
                          <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v12a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 block">
                          Format zakwalifikowany
                        </span>
                        <h3 className="text-base font-black text-zinc-50">
                          {analysisData.category || "Dokumentacja Inżynierska"}
                        </h3>
                      </div>
                    </div>
                    {analysisData.file_size_mb && (
                      <span className="text-xs font-bold text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
                        {analysisData.file_size_mb} MB
                      </span>
                    )}
                  </div>

                  {/* Wiadomość systemowa */}
                  <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-800/70 text-xs font-medium text-amber-100 flex items-start gap-2.5">
                    <span className="text-base leading-none">ℹ️</span>
                    <div>
                      <span className="font-bold block text-amber-50 mb-0.5">Plik przyjęty do wyceny manualnej</span>
                      <span>{analysisData.message}</span>
                    </div>
                  </div>

                  {/* Standardy Drukstacja RFQ */}
                  <div className="space-y-2 text-xs font-semibold text-zinc-400">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Gwarantowana analiza inżynierska i wycena w <strong>24h</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Weryfikacja technologiczna DFM (tolerancje, pasowania)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Pełna ochrona tajemnicy przedsiębiorstwa (automatyczne NDA)</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={handleResetFile}
                      className="text-xs font-bold text-[#F97316] hover:text-orange-300 transition flex items-center gap-1 cursor-pointer"
                    >
                      ← Wgraj inny plik
                    </button>
                    <span className="text-[11px] font-bold text-zinc-500">
                      Standard JLCPCB / Drukstacja
                    </span>
                  </div>
                </div>
              ) : (
                <StudioEmptyDropzone
                  onBrowse={openFilePicker}
                  onFileSelected={handleSelectedFile}
                />
              )}
            </div>

            <aside className="relative z-20 w-full px-4 pb-3 lg:absolute lg:right-4 lg:top-4 lg:w-[300px] lg:px-0 lg:pb-0 lg:bottom-auto">
              <StudioPrintSettings
                isRfq={isRfq}
                compact={isEmptyStage}
                matConfig={matConfig}
                recommendedApps={recommendedApps}
                chemicalResistance={chemicalResistance}
                rfqSubmitted={rfqSubmitted}
                rfqSubmitting={rfqSubmitting}
                rfqName={rfqName}
                setRfqName={setRfqName}
                rfqEmail={rfqEmail}
                setRfqEmail={setRfqEmail}
                rfqPhone={rfqPhone}
                setRfqPhone={setRfqPhone}
                rfqQuantity={rfqQuantity}
                setRfqQuantity={setRfqQuantity}
                rfqNotes={rfqNotes}
                setRfqNotes={setRfqNotes}
                onSubmitRfq={handleSubmitRfq}
                onResetFile={handleResetFile}
                selectedFileName={selectedFile?.name}
                userEmail={user?.email}
              />
            </aside>
          </div>

          <StudioQuoteBar
            isRfq={isRfq}
            hasModel={hasModel}
            isAnalyzing={isAnalyzing}
            isReslicing={isReslicing}
            isBelowMoq={isBelowMoq}
            diffToMoq={diffToMoq}
            isOversized={isOversized}
            onFitToBed={() => setScalePercent(fitPercent)}
            totalPrice={totalPrice}
            quantity={quantity}
            onDecreaseQuantity={() => setQuantity(Math.max(1, quantity - 1))}
            onIncreaseQuantity={() => setQuantity(quantity + 1)}
            onBrowse={openFilePicker}
            onAddToCart={handleAddToCart}
            addingToCart={addingToCart}
            printTime={
              analysisData?.print_time_formatted ||
              (analysisData?.print_time_hours ? `${analysisData.print_time_hours}h` : null)
            }
            filamentWeight={
              quoteWeightG && hasModel
                ? `${quoteWeightG} g`
                : null
            }
            filamentLength={quoteLengthM ? `${quoteLengthM} m` : null}
            engineerReview={engineerReview}
            onEngineerReviewChange={setEngineerReview}
          />
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 py-10 space-y-8 w-full">
        <div id="materialy" className="w-full">
          <MaterialCatalog
            onSelectMaterial={(id) =>
              handleSelectMaterial(id, { preserveColors: isLocked3mf })
            }
          />
        </div>

      </main>

      <footer className="bg-zinc-950 border-t border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 mb-6">Pomoc</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-zinc-400">
              <Link href="/kontakt" className="hover:text-zinc-100">Kontakt</Link>
              <Link href="/#materialy" className="hover:text-zinc-100">Materiały</Link>
              <Link href="/sklep" className="hover:text-zinc-100">Sklep</Link>
              <Link href="/breloki" className="hover:text-zinc-100">Breloki 3D</Link>
              <Link href="/orders" className="hover:text-zinc-100">Moje zlecenia</Link>
              <a href="mailto:kontakt@drukstacja.pl" className="hover:text-zinc-100">kontakt@drukstacja.pl</a>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50 mb-6">drukstacja</h2>
            <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
              Wycena modelu 3D w studio — materiał, kolor i jakość warstwy jak w konfiguratorze produktu.
            </p>
          </div>
        </div>
      </footer>

      <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onLoginSuccess={(u) => setUser(u)} />
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onRemoveItem={(removedId) => {
          setCartItems((prev) => prev.filter((it) => String(it.id) !== String(removedId)));
        }}
      />

    </div>
  );
}