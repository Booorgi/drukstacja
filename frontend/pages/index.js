import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import Navbar from "../components/Navbar";
import MaterialCatalog from "../components/MaterialCatalog";
import StudioWheel from "../components/StudioWheel";
import StudioPrintSettings from "../components/StudioPrintSettings";
import StudioPrintParams from "../components/StudioPrintParams";
import StudioFileProfile from "../components/StudioFileProfile";
import { STL_MATERIALS } from "../lib/filament";

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
    <div className="w-full h-[400px] lg:h-[480px] bg-transparent animate-pulse flex items-center justify-center text-xs font-semibold text-neutral-700">
      Ładowanie podglądu…
    </div>
  ),
});

function materialIdFromFilamentType(type) {
  const t = String(type || "").toUpperCase();
  if (t.includes("TPU") || t.includes("FLEX")) return "TPU_FLEX";
  if (t.includes("ASA")) return "ASA_UV";
  if (t.includes("ABS")) return "ABS_INDUSTRY";
  if (t.includes("PA") || t.includes("NYLON") || t.includes("CF")) return "PA12_CF15";
  if (t.includes("PCTG")) return "PCTG_PRO";
  if (t.includes("PETG") && t.includes("FR")) return "PETG_FR";
  if (t.includes("PETG") || t.includes("PET-G")) return "PETG_TOUGH";
  if (t.includes("SILK")) return "PLA_SILK";
  if (t.includes("MATTE")) return "PLA_MATTE";
  if (t.includes("PLA")) return "PLA_STANDARD";
  return "PLA_STANDARD";
}


export default function Home() {
  const [user, setUser] = useState(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [modelPreviewUrl, setModelPreviewUrl] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // Inżynieryjny dobór materiału i koloru
  const [selectedMaterialGroup, setSelectedMaterialGroup] = useState("all");
  const [selectedMaterial, setSelectedMaterial] = useState(STL_MATERIALS[0].id);
  const [selectedColor, setSelectedColor] = useState(STL_MATERIALS[0].colors[0].hex);

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

  function handleSelectMaterial(matId) {
    const targetMat = STL_MATERIALS.find(
      (m) =>
        m.id === matId ||
        m.id.toLowerCase() === String(matId).toLowerCase() ||
        (m.aliases && m.aliases.some((al) => al.toLowerCase() === String(matId).toLowerCase()))
    );
    if (!targetMat) return;

    setSelectedMaterial(targetMat.id);

    // Jeśli materiał nie znajduje się w aktualnie aktywnym filtrze grupy, zresetuj grupę do "all"
    if (selectedMaterialGroup !== "all") {
      const isVisibleInGroup =
        selectedMaterialGroup === "tech"
          ? targetMat.group === "tech" || targetMat.group === "composite" || targetMat.group === "flex"
          : targetMat.group === selectedMaterialGroup;
      if (!isVisibleInGroup) {
        setSelectedMaterialGroup("all");
      }
    }

    // Ustaw domyślny kolor wybranego tworzywa
    if (targetMat.colors && targetMat.colors.length > 0) {
      setSelectedColor(targetMat.colors[0].hex);
    }

    // Jeśli wybrano materiał techniczny (inny niż PLA), automatycznie zablokuj dyszę 0.2 mm i wymuś 0.4 mm
    const isPla = targetMat.id.toUpperCase().includes("PLA");
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
  const fileInputRef = useRef(null);
  const printParamsRef = useRef(null);

  // Weryfikacja tworzywa PLA dla dyszy 0.2 mm
  const isPlaMaterial = useMemo(() => {
    return (selectedMaterial || "").toUpperCase().includes("PLA");
  }, [selectedMaterial]);

  // Automatyczny powrót do dyszy 0.4 mm przy wyborze materiału nie-PLA
  useEffect(() => {
    if (!isPlaMaterial && nozzleSize === 0.2) {
      setNozzleSize(0.4);
    }
  }, [isPlaMaterial, nozzleSize]);

  useEffect(() => {
    if (!printParamsOpen) return undefined;
    function onDocClick(e) {
      if (printParamsRef.current && !printParamsRef.current.contains(e.target)) {
        setPrintParamsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [printParamsOpen]);

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
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "in_cart")
      .order("created_at", { ascending: false });
    if (data) {
      try {
        const deletedIds = JSON.parse(localStorage.getItem("deleted_order_ids") || "[]");
        setCartItems(data.filter((it) => !deletedIds.includes(String(it.id))));
      } catch {
        setCartItems(data);
      }
    }
  }

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

  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsAnalyzing(true);
    setAnalysisData(null);
    setRfqSubmitted(false);

    const isDirectStl = file.name.toLowerCase().endsWith(".stl");
    if (isDirectStl) {
      setModelPreviewUrl(URL.createObjectURL(file));
    } else {
      setModelPreviewUrl(null);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("layer_height", String(layerHeight));
    formData.append("nozzle_size", String(nozzleSize));
    formData.append("infill", String(infill));
    formData.append("filament_type", matConfig?.name?.split(" ")[0] || "PLA");

    const is3mf = file.name.toLowerCase().endsWith(".3mf");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), is3mf ? 180000 : 55000);

    try {
      const res = await fetch(`${API_URL || ""}/api/analyze-model`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const raw = await res.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(raw?.slice(0, 180) || "Serwer analizy zwrócił nieczytelną odpowiedź.");
      }

      if (!res.ok) {
        throw new Error(data.detail || data.message || "Błąd analizy modelu.");
      }
      setAnalysisData(data);

      if (data.file_profile) {
        const p = data.file_profile;
        if (p.filament_types?.length) {
          handleSelectMaterial(materialIdFromFilamentType(p.filament_types[0]));
        }
        if (p.layer_height) setLayerHeight(p.layer_height);
        if (p.nozzle_size) setNozzleSize(p.nozzle_size);
        if (p.infill != null) setInfill(p.infill);
        if (p.filament_colours?.length) {
          setSelectedColor(p.filament_colours[0]);
        }
      }

      if (data.instant_pricing && (data.preview_glb_url || data.preview_stl_url)) {
        setModelPreviewUrl(resolveAssetUrl(data.preview_glb_url || data.preview_stl_url));
      } else if (!data.instant_pricing) {
        setModelPreviewUrl(null);
      }
    } catch (err) {
      console.error("Błąd zapytania analizy:", err);
      const isAbort = err?.name === "AbortError";
      const isNetworkErr = err.message === "Failed to fetch" || err.name === "TypeError";
      const errorMsg = isAbort
        ? "Analiza gęstego pliku 3MF trwa dłużej niż zwykle. Spróbuj ponownie za chwilę."
        : isNetworkErr
        ? "Nie udało się połączyć z serwerem analizy (przekroczony limit czasu lub zbyt duży plik). Możesz ponowić próbę lub przesłać plik do bezpłatnej wyceny manualnej (RFQ)."
        : `Błąd analizy pliku: ${err.message}`;
      alert(errorMsg);
    } finally {
      clearTimeout(timeoutId);
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

      const { error } = await supabase.from("orders").insert({
        user_id: user?.id || null,
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

      if (error) {
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
    setRfqSubmitted(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Dynamiczne ponowne cięcie modelu (reslicing) przy zmianie infill, layerHeight lub materiału
  useEffect(() => {
    if (!analysisData || analysisData.instant_pricing === false) return;
    if (analysisData.file_profile) return;
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
            support_needed: true,
            volume_cm3: analysisData.volume_cm3,
            surface_area_cm2: analysisData.surface_area_cm2,
            dimensions_mm: analysisData.dimensions_mm,
            triangle_count: analysisData.triangle_count,
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
          }));
        }
      } catch (err) {
        console.warn("Błąd reslicowania:", err);
      } finally {
        setIsReslicing(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [layerHeight, nozzleSize, infill, selectedMaterial, analysisData?.preview_stl_key, analysisData?.color_count, analysisData?.painted_ratio]);

  const volume = analysisData?.volume_cm3 || 32.5;
  const matConfig = STL_MATERIALS.find((m) => m.id === selectedMaterial) || STL_MATERIALS[0];
  const activeColorObj = matConfig?.colors?.find((c) => c.hex === selectedColor) || matConfig?.colors?.[0];
  const isNozzle02 = Math.abs(nozzleSize - 0.2) < 0.05;
  const layerMultiplier = isNozzle02
    ? (Math.abs(layerHeight - 0.08) < 0.02 ? 1.30 : Math.abs(layerHeight - 0.12) < 0.02 ? 1.15 : 1.0)
    : (Math.abs(layerHeight - 0.12) < 0.02 ? 1.25 : Math.abs(layerHeight - 0.28) < 0.02 ? 0.90 : 1.0);
  const nozzleMultiplier = isNozzle02 ? 1.65 : 1.0;
  
  // Obliczenie wagi i ceny bazowej (dla 1 sztuki bez rabatu)
  const baseUnitPrice = useMemo(() => {
    if (analysisData?.price_breakdown?.unit_price_pln != null) {
      return analysisData.price_breakdown.unit_price_pln;
    }
    // Kalibrowany model geometryczny dopasowany do slicera:
    // np. Watch case (7.16 cm3 przy 20% infill) -> ~9.8g -> 2.65 PLN brutto (dysza 0.4 mm, warstwa 0.20 mm)
    const density = matConfig?.density || 1.24;
    const perimeterRatio = 0.72;
    const infillRatio = (infill / 100) * (1.0 - perimeterRatio);
    const effectiveVolCm3 = volume * (perimeterRatio + infillRatio);
    const estWeightG = effectiveVolCm3 * density * 1.42;
    const ratePerG = matConfig?.ratePerG || 0.27;
    const matCost = estWeightG * ratePerG * layerMultiplier * nozzleMultiplier;
    return Math.max(0.80, matCost);
  }, [analysisData, volume, matConfig, infill, layerMultiplier, nozzleMultiplier]);

  // Czysta liniowa cena bez rabatów ilościowych
  const unitPrice = (Math.round(baseUnitPrice * 100) / 100).toFixed(2);
  const totalPrice = (parseFloat(unitPrice) * quantity).toFixed(2);

  // Weryfikacja wgranego modelu – ukrycie ceny i blokada koszyka przed analizą
  const hasModel = Boolean(analysisData && (analysisData.preview_stl_url || analysisData.file_key || analysisData.volume_cm3 != null));
  const MIN_ORDER_VALUE = 30.00;
  const isBelowMoq = hasModel && parseFloat(totalPrice) < MIN_ORDER_VALUE;
  const diffToMoq = (MIN_ORDER_VALUE - parseFloat(totalPrice)).toFixed(2);
  const suggestedQtyForMoq = Math.max(1, Math.ceil(MIN_ORDER_VALUE / Math.max(0.1, parseFloat(unitPrice))));

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

  async function handleAddToCart() {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setAddingToCart(true);
    try {
      const { data: newOrder, error } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          file_name: selectedFile?.name || "Model 3D STL",
          material: `${matConfig.name} (${activeColorObj?.name || selectedColor})`,
          technology: `${
            matConfig.group === "composite"
              ? "FDM Hardened Steel 0.4mm (Carbon)"
              : matConfig.group === "flex"
              ? "FDM Direct Drive 0.4mm (Flex TPU)"
              : `FDM Precision ${nozzleSize}mm`
          }${analysisData?.print_time_formatted ? ` | Czas: ${analysisData.print_time_formatted}` : ""}${
            analysisData?.filament_weight_g ? ` | Waga: ${analysisData.filament_weight_g}g` : ""
          }`,
          layer_height: `${layerHeight} mm`,
          infill: infill,
          clean_supports: true,
          brass_inserts: false,
          quantity: quantity,
          total_price: parseFloat(totalPrice),
          dimensions_mm: analysisData?.dimensions_mm || [60, 60, 40],
          status: "in_cart",
        })
        .select()
        .single();

      if (error) throw error;

      // W tle: wygenerowanie pakietu produkcyjnego .3MF
      if (newOrder?.id && (analysisData?.preview_stl_key || analysisData?.file_key)) {
        fetch(`${API_URL || ""}/api/generate-3mf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: newOrder.id,
            model_key: analysisData.preview_stl_key || analysisData.file_key,
            file_name: selectedFile?.name || "model.stl",
            material: matConfig.name || "PLA",
            color_hex: activeColorObj?.hex || "#EF4444",
            layer_height: parseFloat(String(layerHeight || "0.2").replace(/[^\d.]/g, "")) || 0.2,
            infill: parseInt(String(infill || "20").replace(/[^\d.]/g, "")) || 20,
            nozzle_size: parseFloat(String(nozzleSize || "0.4").replace(/[^\d.]/g, "")) || 0.4,
          }),
        })
          .then(async (res) => {
            if (res.ok) {
              const resData = await res.json();
              if (resData.download_url) {
                await supabase
                  .from("orders")
                  .update({ production_file_url: resData.download_url })
                  .eq("id", newOrder.id);
              }
            }
          })
          .catch((e) => console.warn("Background 3MF generation:", e));
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
    id: c.hex,
    hex: c.hex,
    name: c.name,
  }));
  const materialWheelItems = filteredMaterials.map((m) => ({
    id: m.id,
    hex: m.colors?.[0]?.hex || "#888888",
    name: m.name,
  }));
  const printParamWheelItems = [
    { id: "nozzle", hex: "#2A2A2A", name: `${nozzleSize} mm` },
    { id: "layer", hex: "#E11D2A", name: `${Number(layerHeight).toFixed(2)} mm` },
    { id: "infill", hex: "#D4D4D4", name: `${infill}%` },
  ];
  const isLocked3mf = Boolean(
    analysisData?.file_profile ||
      String(selectedFile?.name || analysisData?.original_filename || "").toLowerCase().endsWith(".3mf")
  );
  const fileProfile = analysisData?.file_profile || {};

  return (
    <div className="min-h-screen flex flex-col bg-[#E2E2E2] text-[#111111] font-sans">
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
        onChange={handleFileUpload}
      />

      <section id="configurator" className="relative scroll-mt-20 bg-[#E2E2E2]">

        <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 pt-3 sm:pt-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-700">
                {analysisData && analysisData.instant_pricing === false
                  ? "Wycena inżynierska"
                  : "Konfigurator druku"}
              </p>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-neutral-900 mt-0.5">
                {selectedFile ? selectedFile.name : "Wgraj model do wyceny"}
              </h1>
            </div>
            {selectedFile && (
              <button
                type="button"
                onClick={handleResetFile}
                className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-white"
              >
                Zmień plik
              </button>
            )}
          </div>
        </div>

        <div className="relative w-full">
          <aside className="relative z-50 flex flex-row flex-wrap justify-center gap-3 overflow-visible px-4 pt-2 md:pointer-events-none md:absolute md:left-0 md:top-2 md:bottom-4 lg:right-[320px] md:flex-col md:flex-nowrap md:items-start md:justify-evenly md:gap-2 md:px-[10%] md:pt-0">
            {isLocked3mf ? (
              <div className="md:pointer-events-auto">
                <StudioFileProfile
                  colours={fileProfile.filament_colours || analysisData?.filament_colours || []}
                  filamentTypes={fileProfile.filament_types || []}
                  layerHeight={fileProfile.layer_height || layerHeight}
                  nozzleSize={fileProfile.nozzle_size || nozzleSize}
                  infill={fileProfile.infill ?? infill}
                />
              </div>
            ) : (
              <>
                <div className="md:pointer-events-auto">
                  <StudioWheel
                    items={materialWheelItems}
                    value={selectedMaterial}
                    onChange={(item) => handleSelectMaterial(item.id)}
                    size={58}
                    label="Materiał"
                  />
                </div>
                <div className="md:pointer-events-auto md:-ml-8">
                  <StudioWheel
                    items={colorWheelItems}
                    value={selectedColor}
                    onChange={(item) => setSelectedColor(item.hex)}
                    size={58}
                    label="Kolor"
                  />
                </div>
                <div className="relative z-[80] overflow-visible md:pointer-events-auto" ref={printParamsRef}>
                  <StudioWheel
                    items={printParamWheelItems}
                    onOpen={() => setPrintParamsOpen((open) => !open)}
                    size={58}
                    label="Parametry"
                    caption={`${nozzleSize} · ${Number(layerHeight).toFixed(2)} · ${infill}%`}
                  />
                  {printParamsOpen && (
                    <div className="absolute bottom-full left-1/2 z-[90] mb-2 -translate-x-1/2 md:bottom-0 md:left-full md:top-auto md:mb-0 md:ml-3 md:translate-x-0">
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
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </aside>

          <div className="relative w-full flex items-center justify-center min-h-[420px] lg:min-h-[500px] md:pl-[28px] lg:pr-[320px]">
              {isAnalyzing ? (
                <div className="flex flex-col items-center gap-3 bg-white/85 p-6 rounded-3xl shadow-sm border border-slate-200/80 backdrop-blur-sm">
                  <div className="w-10 h-10 border-4 border-[#EF4444] border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs font-bold text-slate-700">
                    Analizuję strukturę pliku i geometrię produkcyjną...
                  </span>
                </div>
              ) : analysisData && analysisData.instant_pricing === false ? (
                /* KARTA DOKUMENTACJI TECHNICZNEJ / PCB / RFQ (STANDARD JLCPCB / PCBWAY) */
                <div className="w-full max-w-lg bg-white/95 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-[0_15px_35px_rgba(0,0,0,0.05)] space-y-5">
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
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                          Format zakwalifikowany
                        </span>
                        <h3 className="text-base font-black text-slate-900">
                          {analysisData.category || "Dokumentacja Inżynierska"}
                        </h3>
                      </div>
                    </div>
                    {analysisData.file_size_mb && (
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                        {analysisData.file_size_mb} MB
                      </span>
                    )}
                  </div>

                  {/* Wiadomość systemowa */}
                  <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/70 text-xs font-medium text-amber-900 flex items-start gap-2.5">
                    <span className="text-base leading-none">ℹ️</span>
                    <div>
                      <span className="font-bold block text-amber-950 mb-0.5">Plik przyjęty do wyceny manualnej</span>
                      <span>{analysisData.message}</span>
                    </div>
                  </div>

                  {/* Standardy Drukstacja RFQ */}
                  <div className="space-y-2 text-xs font-semibold text-slate-600">
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

                  <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleResetFile}
                      className="text-xs font-bold text-[#EF4444] hover:text-red-700 transition flex items-center gap-1 cursor-pointer"
                    >
                      ← Wgraj inny plik
                    </button>
                    <span className="text-[11px] font-bold text-slate-400">
                      Standard JLCPCB / Drukstacja
                    </span>
                  </div>
                </div>
              ) : modelPreviewUrl ? (
                <CadViewer3D
                  studio
                  modelUrl={modelPreviewUrl}
                  fileName={selectedFile?.name || "model.stl"}
                  analysisData={analysisData}
                  selectedColor={selectedColor}
                  onColorChange={(newHex) => setSelectedColor(newHex)}
                  materialConfig={matConfig}
                  availableColors={matConfig?.colors || []}
                  showSupportsDefault={showSupports}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center cursor-pointer group"
                >
                  <svg
                    className="w-8 h-8 text-neutral-500 group-hover:text-neutral-800 transition"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5V18a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
                  </svg>
                  <span className="text-[15px] font-medium text-neutral-700 group-hover:text-neutral-900 transition">
                    Kliknij, aby wybrać model
                  </span>
                  <span className="text-xs text-neutral-400">
                    .stl .step .obj .3mf · PCB · 2D
                  </span>
                </button>
              )}
            </div>

            <aside className="relative z-20 w-full px-4 pb-3 lg:absolute lg:right-4 lg:top-4 lg:w-[300px] lg:px-0 lg:pb-0 lg:bottom-auto">
              <StudioPrintSettings
                isRfq={Boolean(analysisData && analysisData.instant_pricing === false)}
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

          <div className="sticky bottom-0 z-40 bg-gradient-to-t from-[#E2E2E2] via-[#E2E2E2]/95 to-transparent px-4 pb-3 pt-2 sm:px-6">
            <div className="relative z-30 mx-auto max-w-[1400px] rounded-2xl bg-white/90 backdrop-blur-md border border-white/70 shadow-sm px-3 py-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              {analysisData && analysisData.instant_pricing === false ? (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-800/70 block">
                    Status wyceny
                  </span>
                  <span className="text-2xl font-semibold text-neutral-900">Wycena inżynierska</span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 min-w-0">
                    <div>
                      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-800/70 block">
                        Razem
                      </span>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-2xl sm:text-3xl font-semibold text-neutral-900 tracking-tight">
                          {hasModel ? totalPrice : "—"}
                        </span>
                        <span className="text-sm font-medium text-neutral-700">PLN</span>
                        {isReslicing ? <span className="text-sm text-neutral-500">przeliczam…</span> : null}
                      </div>
                      {isBelowMoq && hasModel && (
                        <p className="text-xs text-neutral-800/80 mt-1">
                          Min. zamówienie 30 PLN (jeszcze {diffToMoq} zł)
                        </p>
                      )}
                    </div>

                    {hasModel && analysisData && analysisData.instant_pricing !== false && (
                      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                        <div>
                          <span className="text-xs uppercase font-semibold text-neutral-500 block">Czas druku</span>
                          <span className="text-sm font-semibold text-neutral-900">
                            {analysisData.print_time_formatted || (analysisData.print_time_hours ? `${analysisData.print_time_hours}h` : "—")}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs uppercase font-semibold text-neutral-500 block">Waga</span>
                          <span className="text-sm font-semibold text-neutral-900">
                            {analysisData.filament_weight_g ? `${analysisData.filament_weight_g} g` : `${Math.round(volume * 1.24 * (0.35 + (infill / 100) * 0.65))} g`}
                          </span>
                        </div>
                        {analysisData.filament_length_m ? (
                          <div>
                            <span className="text-xs uppercase font-semibold text-neutral-500 block">Długość</span>
                            <span className="text-sm font-semibold text-neutral-900">
                              {analysisData.filament_length_m} m
                            </span>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center bg-neutral-100 rounded-full px-2 py-1">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={!hasModel}
                        className="w-8 h-8 flex items-center justify-center text-neutral-800 font-medium hover:bg-white rounded-full disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-semibold text-sm">{quantity}</span>
                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        disabled={!hasModel}
                        className="w-8 h-8 flex items-center justify-center text-neutral-800 font-medium hover:bg-white rounded-full disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                    <button
                      disabled={!hasModel || addingToCart || isAnalyzing}
                      onClick={handleAddToCart}
                      className={`px-6 py-3 rounded-full text-sm font-semibold transition ${
                        !hasModel || addingToCart || isAnalyzing
                          ? "bg-neutral-400 text-white/70 cursor-not-allowed"
                          : "bg-[#111111] hover:bg-black text-white cursor-pointer"
                      }`}
                    >
                      {addingToCart ? "Zapisuję…" : isAnalyzing ? "Analizuję…" : !hasModel ? "Wgraj model" : "Dodaj do koszyka"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 py-10 space-y-8 w-full">
        <div id="materialy" className="w-full">
          <MaterialCatalog onSelectMaterial={handleSelectMaterial} />
        </div>

      </main>

      <footer className="bg-[#E2E2E2] border-t border-black/5">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 mb-6">Pomoc</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm text-neutral-700">
              <Link href="/kontakt" className="hover:text-neutral-900">Kontakt</Link>
              <Link href="/#materialy" className="hover:text-neutral-900">Materiały</Link>
              <Link href="/sklep" className="hover:text-neutral-900">Sklep</Link>
              <Link href="/breloki" className="hover:text-neutral-900">Breloki 3D</Link>
              <Link href="/orders" className="hover:text-neutral-900">Moje zlecenia</Link>
              <a href="mailto:kontakt@drukstacja.pl" className="hover:text-neutral-900">kontakt@drukstacja.pl</a>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 mb-6">drukstacja</h2>
            <p className="text-sm text-neutral-600 max-w-md leading-relaxed">
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