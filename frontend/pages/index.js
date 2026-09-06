import React, { useState, useEffect, useRef, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import { supabase } from "../lib/supabaseClient";
import AuthModal from "../components/AuthModal";
import CartDrawer from "../components/CartDrawer";
import Navbar from "../components/Navbar";
import { STL_MATERIAL_GROUPS, STL_MATERIALS } from "../lib/filament";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

const CadViewer3D = dynamic(() => import("../components/CadViewer3D"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[520px] rounded-3xl bg-slate-100 animate-pulse flex items-center justify-center text-xs font-bold text-slate-400">
      Ładowanie środowiska CAD...
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);

  // Inżynieryjny dobór materiału i koloru
  const [selectedMaterialGroup, setSelectedMaterialGroup] = useState("all");
  const [selectedMaterial, setSelectedMaterial] = useState(STL_MATERIALS[0].id);
  const [selectedColor, setSelectedColor] = useState(STL_MATERIALS[0].colors[0].hex);

  const filteredMaterials = useMemo(() => {
    if (selectedMaterialGroup === "all") return STL_MATERIALS;
    return STL_MATERIALS.filter((m) => m.group === selectedMaterialGroup);
  }, [selectedMaterialGroup]);

  const currentIndex = useMemo(() => {
    const idx = filteredMaterials.findIndex((m) => m.id === selectedMaterial);
    return idx >= 0 ? idx : 0;
  }, [filteredMaterials, selectedMaterial]);

  function handleSelectMaterial(matId) {
    setSelectedMaterial(matId);
    const targetMat = STL_MATERIALS.find((m) => m.id === matId);
    if (targetMat && targetMat.colors && targetMat.colors.length > 0) {
      const hasColor = targetMat.colors.some((c) => c.hex === selectedColor);
      if (!hasColor) {
        setSelectedColor(targetMat.colors[0].hex);
      }
    }
  }

  function handleSelectGroup(groupId) {
    setSelectedMaterialGroup(groupId);
    const list = groupId === "all" ? STL_MATERIALS : STL_MATERIALS.filter((m) => m.group === groupId);
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
  const fileInputRef = useRef(null);

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

    try {
      const res = await fetch(`${API_URL || ""}/api/analyze-model`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Błąd analizy modelu.");
      }

      const data = await res.json();
      setAnalysisData(data);

      if (data.instant_pricing && data.preview_stl_url) {
        setModelPreviewUrl(data.preview_stl_url);
      } else if (!data.instant_pricing) {
        setModelPreviewUrl(null);
      }
    } catch (err) {
      alert("Błąd analizy pliku: " + err.message);
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
            filament_type: matConfig?.name?.split(" ")[0] || "PLA",
            quantity: quantity,
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
  }, [layerHeight, nozzleSize, infill, selectedMaterial]);

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

    if (id.includes("ASA")) {
      return ["Elementy zewnętrzne i outdoor", "Części motoryzacyjne", "Obudowy czujników i kamer", "Uchwyty paneli solarnych"];
    }
    if (id.includes("PLA")) {
      return ["Prototypy koncepcyjne", "Obudowy urządzeń domowych", "Makiety architektoniczne", "Figurki i detale o wysokiej precyzji"];
    }
    if (id.includes("PETG") || id.includes("PCTG")) {
      return ["Uchwyty użytkowe i narzędzia", "Elementy odporne na uderzenia", "Pojemniki i obudowy szczelne", "Części maszyn i osłony"];
    }
    if (id.includes("ABS")) {
      return ["Elementy o wysokiej udarności", "Obudowy elektroniki przemysłowej", "Adaptery i złączki warsztatowe", "Części narażone na obciążenia"];
    }
    if (id.includes("PP")) {
      return ["Pojemniki na chemikalia i płyny", "Sprzęt laboratoryjny", "Elementy instalacji płynowych", "Części o niskim tarciu"];
    }
    if (group === "flex") {
      return ["Uszczelki i dławiki", "Odbojniki i amortyzatory drgań", "Elastyczne chwytaki i osłony", "Etui ochronne"];
    }
    if (group === "composite" || id.includes("CF")) {
      return ["Ramiona dronów i robotyka", "Elementy konstrukcyjne o skrajnej sztywności", "Części motorsport i wyczynowe", "Szablony produkcyjne i formy"];
    }
    return ["Prototypy inżynieryjne", "Elementy użytkowe", "Obudowy", "Części zamienne"];
  }, [matConfig]);

  // Odporność chemiczna
  const chemicalResistance = useMemo(() => {
    const id = matConfig?.id || "";
    const group = matConfig?.group || "";
    if (id.includes("PP")) return "Ekstremalna (Kwasy, zasady, rozpuszczalniki)";
    if (id.includes("PETG") || id.includes("PCTG") || id.includes("ASA")) return "Wysoka (Oleje, smary, woda, chemia myjąca)";
    if (group === "composite") return "Wysoka (Środowisko przemysłowe i paliwa)";
    if (group === "flex") return "Dobra (Tłuszcze, oleje mineralne)";
    return "Standardowa (Odporność domowa)";
  }, [matConfig]);

  async function handleAddToCart() {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    setAddingToCart(true);
    try {
      const { error } = await supabase.from("orders").insert({
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
      });

      if (error) throw error;
      await fetchCart(user.id);
      setIsCartOpen(true);
    } catch (err) {
      alert("Błąd koszyka: " + err.message);
    } finally {
      setAddingToCart(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F1F5F9] text-[#0F172A] font-sans">
      <Head>
        <title>Drukstacja — Profesjonalny Druk 3D i Konfiguratory</title>
      </Head>

      {/* NAVBAR */}
      <Navbar
        activePage="wycena"
        user={user}
        onOpenAuth={() => setIsAuthOpen(true)}
        cartItems={cartItems}
        onOpenCart={() => setIsCartOpen(true)}
      />

      {/* GŁÓWNY UKŁAD STRONY: 2 KOLUMNY GÓRA + 1 KOLUMNA PEŁNA SZEROKOŚĆ DÓŁ */}
      <main className="max-w-7xl w-full mx-auto px-4 md:px-6 py-8 space-y-8">
        <div className="bg-white rounded-[32px] border border-slate-200/80 shadow-[0_25px_70px_rgba(0,0,0,0.06)] w-full grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-[640px]">
          
          {/* LEWA STRONA: 3D STUDIO STAGE LUB KARTA DOKUMENTACJI RFQ */}
          <div className="lg:col-span-7 bg-gradient-to-b from-[#F8FAFC] to-[#EDF2F7] relative flex flex-col justify-between p-6 md:p-8">
            <div className="flex items-center justify-between z-10">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#EF4444] block">
                  {analysisData && analysisData.instant_pricing === false
                    ? "Zgłoszenie Wyceny Inżynierskiej (RFQ)"
                    : "Studio Wyceny CAD / STL"}
                </span>
                <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                  {selectedFile ? selectedFile.name : "Wgraj plik produkcyjny do wyceny"}
                </h1>
              </div>

              {/* Przycisk zmiany pliku */}
              {selectedFile && (
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="text-xs font-bold text-slate-500 hover:text-[#EF4444] bg-white px-3.5 py-1.5 rounded-full border border-slate-200 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>↺</span>
                  <span>Zmień plik</span>
                </button>
              )}
            </div>

            {/* Główny obszar wizualny */}
            <div className="relative w-full my-auto flex items-center justify-center">
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
                /* VIEWPORT 3D DLA INSTANT 3D PRICING - PROFESJONALNY CAD & DFM INSPECTOR */
                <CadViewer3D
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
                /* DROPZONE PRZED UPLOADEM */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full max-h-[340px] rounded-3xl border-2 border-dashed border-slate-300 hover:border-[#EF4444] bg-white/60 hover:bg-white/80 flex flex-col items-center justify-center gap-3 p-6 cursor-pointer transition text-center"
                >
                  <div className="w-14 h-14 rounded-2xl bg-red-50 text-[#EF4444] flex items-center justify-center font-bold text-2xl shadow-sm">
                    ↑
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">
                      Kliknij lub przeciągnij plik produkcyjny
                    </span>
                    <span className="text-xs text-slate-400 block mt-0.5">
                      Modele 3D, pliki CAD, płytki PCB, rysunki techniczne lub archiwa ZIP (do 100 MB)
                    </span>
                  </div>

                  {/* Kafelki formatów */}
                  <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2">
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-slate-700 text-[10px] font-bold shadow-xs">
                      ⚡ 3D CAD (.step, .stl, .obj, .3mf)
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-slate-700 text-[10px] font-bold shadow-xs">
                      📟 PCB & Gerber (.zip, .gbr, .kicad)
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 text-slate-700 text-[10px] font-bold shadow-xs">
                      📐 Rysunki 2D (.dxf, .dwg, .pdf)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* PASEK TELEMETRII SLICERA: CZAS DRUKU, WAGA FILAMENTU, DŁUGOŚĆ ŚCIEŻKI */}
            {analysisData && analysisData.instant_pricing !== false && (
              <div className="z-10 py-2 px-3 rounded-2xl bg-slate-50/95 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs mb-2">
                <div className="flex items-center gap-4">
                  {/* Czas druku */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">⏱️</span>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Czas druku</span>
                      <span className="font-extrabold text-slate-800">
                        {analysisData.print_time_formatted || (analysisData.print_time_hours ? `${analysisData.print_time_hours}h` : "~2h 15m")}
                      </span>
                    </div>
                  </div>

                  {/* Waga filamentu */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">⚖️</span>
                    <div>
                      <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Waga materiału</span>
                      <span className="font-extrabold text-slate-800">
                        {analysisData.filament_weight_g ? `${analysisData.filament_weight_g} g` : `${Math.round(volume * 1.24 * (0.35 + (infill/100)*0.65))} g`}
                      </span>
                    </div>
                  </div>

                  {/* Długość filamentu */}
                  {analysisData.filament_length_m && (
                    <div className="hidden sm:flex items-center gap-1.5">
                      <span className="text-sm">📏</span>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Długość</span>
                        <span className="font-extrabold text-slate-800">
                          {analysisData.filament_length_m} m
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status silnika slicera */}
                <div className="flex items-center gap-1.5 ml-auto">
                  {isReslicing ? (
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-[#EF4444] bg-red-50 px-2.5 py-1 rounded-full border border-red-200/70 animate-pulse">
                      <svg className="animate-spin w-3 h-3 text-[#EF4444]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Przeliczam G-Code...
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 shadow-xs flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{analysisData.slicer_engine === "prusa-slicer-cli" ? "PrusaSlicer CLI" : "G-Code Core"}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Dolny pasek ceny lub statusu RFQ */}
            <div className="flex items-end justify-between z-10 pt-3 border-t border-slate-200/70">
              {analysisData && analysisData.instant_pricing === false ? (
                <>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
                      Status wyceny
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900 tracking-tight">
                        Wycena Inżynierska
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3.5 py-1.5 rounded-full border border-emerald-200 shadow-xs">
                    Bezpłatna weryfikacja DFM (24h)
                  </span>
                </>
              ) : (
                <>
                  <div>
                    <span className="text-[11px] font-bold uppercase text-slate-400 block tracking-wider">
                      Cena zamówienia
                    </span>
                    {hasModel ? (
                      <>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-3xl font-black text-slate-900 tracking-tight">
                            {totalPrice}
                          </span>
                          <span className="text-sm font-bold text-slate-500">PLN</span>
                          {quantity > 1 && (
                            <span className="text-xs font-semibold text-slate-400">
                              ({unitPrice} PLN / szt.)
                            </span>
                          )}
                        </div>
                        {isBelowMoq && (
                          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg">
                            <span>⚠️ Min. zamówienie w koszyku: 30.00 PLN</span>
                            <span className="text-amber-600 font-normal">
                              (jeszcze {diffToMoq} zł / {suggestedQtyForMoq} szt.)
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-3xl font-black text-slate-300 tracking-tight">
                          --
                        </span>
                        <span className="text-sm font-bold text-slate-400">PLN</span>
                        <span className="text-xs font-medium text-slate-400 ml-1">
                          (Wgraj model, aby poznać cenę)
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white border border-slate-200 rounded-full px-2 py-1 shadow-sm">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        disabled={!hasModel}
                        className="w-7 h-7 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-100 rounded-full transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-bold text-sm text-slate-800">
                        {quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        disabled={!hasModel}
                        className="w-7 h-7 flex items-center justify-center text-slate-600 font-bold hover:bg-slate-100 rounded-full transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        +
                      </button>
                    </div>

                    <button
                      disabled={!hasModel || addingToCart || isAnalyzing}
                      onClick={handleAddToCart}
                      className={`px-6 py-3.5 rounded-full font-bold text-xs uppercase tracking-wider transition ${
                        !hasModel || addingToCart || isAnalyzing
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed shadow-none"
                          : "bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-lg shadow-red-500/25 cursor-pointer"
                      }`}
                    >
                      {addingToCart ? "Zapisuję..." : isAnalyzing ? "Analizuję..." : !hasModel ? "Wgraj model 3D" : "Dodaj do koszyka +"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* PRAWA STRONA: MODUŁ PARAMETRÓW LUB FORMULARZ RFQ */}
          <div className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between bg-white border-l border-slate-100">
            <div className="space-y-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".stl,.step,.stp,.obj,.3mf,.iges,.igs,.ply,.glb,.gltf,.off,.3ds,.dxf,.dwg,.pdf,.zip,.rar,.7z,.kicad_pcb,.pcbdoc,.brd,.gbr,.ger,.gtl,.gbl,.gts,.gbs,.drl,.fcstd,.ifc,.3dm,.png,.jpg,.jpeg"
                className="hidden"
                onChange={handleFileUpload}
              />

              {/* Upload pliku */}
              <div>
                <span className="text-xs font-bold uppercase text-slate-400 block mb-2 tracking-wider">
                  Plik produkcyjny:
                </span>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800 transition"
                >
                  <span className="truncate max-w-[220px]">
                    {selectedFile ? selectedFile.name : "Wybierz plik z dysku"}
                  </span>
                  <span className="text-[#EF4444]">
                    {isAnalyzing ? "Analizuję..." : "Zmień plik"}
                  </span>
                </button>
              </div>

              {analysisData && analysisData.instant_pricing === false ? (
                /* FORMULARZ WYCENY INDYWIDUALNEJ (RFQ) */
                <div className="space-y-4 pt-1">
                  <div>
                    <span className="text-[11px] font-bold uppercase text-[#EF4444] tracking-wider block mb-0.5">
                      Formularz Zgłoszenia
                    </span>
                    <h2 className="text-xl font-black text-slate-900 tracking-tight">
                      Wycena Projektowa & DFM
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Nasz zespół inżynierów zweryfikuje plik <strong>{selectedFile?.name}</strong> i odeśle wycenę.
                    </p>
                  </div>

                  {rfqSubmitted ? (
                    <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-200 text-center space-y-3 my-2">
                      <div className="w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto text-xl font-bold shadow-sm">
                        ✓
                      </div>
                      <h3 className="text-base font-extrabold text-emerald-900">
                        Zapytanie zostało przesłane!
                      </h3>
                      <p className="text-xs text-emerald-700 leading-relaxed">
                        Dziękujemy. Przygotujemy ofertę technologiczną w ciągu <strong>24 godzin</strong> na adres: <strong>{rfqEmail || user?.email}</strong>.
                      </p>
                      <button
                        type="button"
                        onClick={handleResetFile}
                        className="mt-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
                      >
                        Wyceń kolejny plik
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmitRfq} className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Imię i nazwisko / Nazwa firmy:
                        </label>
                        <input
                          type="text"
                          value={rfqName}
                          onChange={(e) => setRfqName(e.target.value)}
                          placeholder="np. Jan Kowalski / ACME Sp. z o.o."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Adres e-mail <span className="text-red-500">*</span>:
                          </label>
                          <input
                            type="email"
                            required
                            value={rfqEmail}
                            onChange={(e) => setRfqEmail(e.target.value)}
                            placeholder="jan@firma.pl"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Numer telefonu:
                          </label>
                          <input
                            type="tel"
                            value={rfqPhone}
                            onChange={(e) => setRfqPhone(e.target.value)}
                            placeholder="+48 500 000 000"
                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Planowana ilość sztuk:
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={rfqQuantity}
                          onChange={(e) => setRfqQuantity(e.target.value)}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Wymagania i specyfikacja (materiał, tolerancje, termin):
                        </label>
                        <textarea
                          rows={3}
                          value={rfqNotes}
                          onChange={(e) => setRfqNotes(e.target.value)}
                          placeholder="np. Zastosowanie zewnętrzne, kolor czarny mat, pasowanie H7, realizacja do 3 dni..."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#EF4444] resize-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={rfqSubmitting}
                        className="w-full py-3.5 px-6 rounded-2xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-500/25 transition cursor-pointer disabled:opacity-50"
                      >
                        {rfqSubmitting ? "Wysyłanie zgłoszenia..." : "Wyślij do bezpłatnej wyceny inżynierskiej (24h) →"}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                /* SEKCJA KONFIGURATORA MATERIAŁU DLA MODELI 3D */
                <>
                  <div className="space-y-3">
                    {/* Nagłówek i Taby Kategorii */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                          Wybierz Materiał Drukarki:
                        </span>
                        <span className="text-[11px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                          {currentIndex + 1} z {filteredMaterials.length}
                        </span>
                      </div>

                      {/* Taby kategorii */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                        {STL_MATERIAL_GROUPS.map((grp) => {
                          const isActive = selectedMaterialGroup === grp.id;
                          return (
                            <button
                              key={grp.id}
                              type="button"
                              onClick={() => handleSelectGroup(grp.id)}
                              className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                                isActive
                                  ? "bg-slate-900 text-white shadow-sm"
                                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                              }`}
                            >
                              {grp.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Karuzela materiałów z próbnikami kolorów */}
                    <div className="flex items-center gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={handlePrevMaterial}
                        title="Poprzedni materiał"
                        className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-700 hover:text-slate-900 border border-slate-200 shadow-sm flex items-center justify-center transition-all flex-shrink-0 cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>

                      {/* Karta materiału - wersja kompaktowa na pełną szerokość */}
                      <div className="flex-1 w-full min-w-0 bg-slate-50/90 rounded-2xl p-2.5 border border-slate-200/80 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 truncate">
                            {matConfig.name}
                          </span>
                          {matConfig.badge && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 flex-shrink-0">
                              {matConfig.badge}
                            </span>
                          )}
                        </div>

                        {/* Bezpieczne próbki kolorów w estetycznym poziomym rzędzie z odstępem */}
                        <div className="flex items-center gap-2 p-1.5 overflow-x-auto scrollbar-thin">
                          {matConfig.colors?.map((c) => {
                            const isSelected = selectedColor?.toLowerCase() === c.hex?.toLowerCase();
                            return (
                              <button
                                key={c.id || c.hex}
                                type="button"
                                onClick={() => setSelectedColor(c.hex)}
                                title={c.name}
                                className={`w-7 h-7 rounded-full p-0.5 border-2 transition-all flex items-center justify-center flex-shrink-0 cursor-pointer ${
                                  isSelected
                                    ? "border-[#EF4444] scale-105 shadow-sm"
                                    : "border-transparent hover:border-slate-300"
                                }`}
                              >
                                <div
                                  className="w-full h-full rounded-full"
                                  style={{
                                    backgroundColor: c.hex,
                                    border:
                                      c.hex?.toLowerCase() === "#ffffff" ||
                                      c.hex?.toLowerCase() === "#f5f5f5" ||
                                      c.hex?.toLowerCase() === "#f8f9fa"
                                        ? "1px solid #CBD5E1"
                                        : "none",
                                  }}
                                />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleNextMaterial}
                        title="Następny materiał"
                        className="w-9 h-9 rounded-xl bg-white hover:bg-slate-100 active:scale-95 text-slate-700 hover:text-slate-900 border border-slate-200 shadow-sm flex items-center justify-center transition-all flex-shrink-0 cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    {/* Kropki paginacji */}
                    <div className="flex items-center justify-center gap-1.5 pt-1">
                      {filteredMaterials.map((mat, idx) => {
                        const isActive = idx === currentIndex;
                        return (
                          <button
                            key={mat.id}
                            type="button"
                            onClick={() => handleSelectMaterial(mat.id)}
                            title={mat.name}
                            className={`h-2 rounded-full transition-all cursor-pointer ${
                              isActive
                                ? "w-6 bg-[#EF4444]"
                                : "w-2 bg-slate-300 hover:bg-slate-400"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Wybór średnicy dyszy (Nozzle Size) */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-700">
                          Średnica dyszy ekstrudera
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">(Nozzle)</span>
                      </div>
                      <span className="text-xs font-extrabold text-[#EF4444] bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                        {nozzleSize === 0.2 ? "0.2 mm (Precyzja)" : "0.4 mm (Standard)"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Dysza 0.4 mm */}
                      <button
                        type="button"
                        onClick={() => setNozzleSize(0.4)}
                        className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                          nozzleSize === 0.4
                            ? "border-[#EF4444] bg-red-50/50 shadow-sm ring-1 ring-red-400/40"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className={`text-xs font-black ${nozzleSize === 0.4 ? "text-[#EF4444]" : "text-slate-800"}`}>
                            Dysza 0.4 mm
                          </span>
                          {nozzleSize === 0.4 ? (
                            <span className="w-3.5 h-3.5 rounded-full bg-[#EF4444] text-white flex items-center justify-center text-[9px] font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold text-slate-400">Standard</span>
                          )}
                        </div>
                        <div>
                          <span className={`text-[11px] font-bold block leading-tight ${nozzleSize === 0.4 ? "text-slate-900" : "text-slate-700"}`}>
                            Standardowa
                          </span>
                          <span className="text-[10px] text-slate-500 block leading-tight truncate mt-0.5">
                            Wszystkie materiały
                          </span>
                        </div>
                      </button>

                      {/* Dysza 0.2 mm */}
                      <div className="relative group">
                        <button
                          type="button"
                          disabled={!isPlaMaterial}
                          onClick={() => {
                            if (isPlaMaterial) setNozzleSize(0.2);
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                            !isPlaMaterial
                              ? "border-slate-200 bg-slate-100/70 opacity-60 cursor-not-allowed"
                              : nozzleSize === 0.2
                              ? "border-[#EF4444] bg-red-50/50 shadow-sm ring-1 ring-red-400/40 cursor-pointer"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={`text-xs font-black ${!isPlaMaterial ? "text-slate-400" : nozzleSize === 0.2 ? "text-[#EF4444]" : "text-slate-800"}`}>
                              Dysza 0.2 mm
                            </span>
                            {!isPlaMaterial ? (
                              <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Tylko PLA
                              </span>
                            ) : nozzleSize === 0.2 ? (
                              <span className="w-3.5 h-3.5 rounded-full bg-[#EF4444] text-white flex items-center justify-center text-[9px] font-bold">
                                ✓
                              </span>
                            ) : (
                              <span className="text-[9px] font-semibold text-slate-400">Precyzja</span>
                            )}
                          </div>
                          <div>
                            <span className={`text-[11px] font-bold block leading-tight ${!isPlaMaterial ? "text-slate-400" : nozzleSize === 0.2 ? "text-slate-900" : "text-slate-700"}`}>
                              Ultraprecyzyjna
                            </span>
                            <span className="text-[10px] text-slate-500 block leading-tight truncate mt-0.5">
                              {!isPlaMaterial ? "Niedostępna dla tego tworzywa" : "Miniatury i mikrogwinty"}
                            </span>
                          </div>
                        </button>

                        {/* Tooltip przy zablokowaniu */}
                        {!isPlaMaterial && (
                          <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-slate-900 text-white text-[10px] rounded-lg shadow-xl z-20 pointer-events-none leading-snug">
                            Dysza 0.2 mm dostępna tylko dla tworzywa PLA (ryzyko zapychania przy innych materiałach).
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Wysokość warstwy (Jakość druku) */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700">
                        Wysokość warstwy (Jakość druku)
                      </span>
                      <span className="text-xs font-extrabold text-[#EF4444] bg-red-50 px-2 py-0.5 rounded-full border border-red-100">
                        {`${layerHeight} mm`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {layerHeightOptions.map((item) => {
                        const isSelected = Math.abs(layerHeight - item.val) < 0.01;
                        return (
                          <button
                            key={item.val}
                            type="button"
                            onClick={() => setLayerHeight(item.val)}
                            className={`p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between cursor-pointer ${
                              isSelected
                                ? "border-[#EF4444] bg-red-50/50 shadow-sm ring-1 ring-red-400/40"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                            }`}
                          >
                            <div className="flex items-center justify-between w-full mb-1">
                              <span className={`text-xs font-black ${isSelected ? "text-[#EF4444]" : "text-slate-800"}`}>
                                {item.label}
                              </span>
                              {isSelected ? (
                                <span className="w-3.5 h-3.5 rounded-full bg-[#EF4444] text-white flex items-center justify-center text-[9px] font-bold">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-[9px] font-semibold text-slate-400">
                                  {item.multiplier}
                                </span>
                              )}
                            </div>
                            <div>
                              <span className={`text-[11px] font-bold block leading-tight ${isSelected ? "text-slate-900" : "text-slate-700"}`}>
                                {item.title}
                              </span>
                              <span className="text-[10px] text-slate-500 block leading-tight truncate mt-0.5">
                                {item.subtitle}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Infill */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-700">
                      <span>Wypełnienie wnętrza (Infill)</span>
                      <span className="text-[#EF4444]">{infill}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={infill}
                      onChange={(e) => setInfill(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 rounded cursor-pointer accent-[#EF4444]"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold pt-1">
                      <span>10% (Lekki)</span>
                      <span>40% (Standard)</span>
                      <span>100% (Lity)</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Wymiary modelu */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-400">
              <span>
                {analysisData && analysisData.instant_pricing === false
                  ? `Format: ${analysisData.category || "Dokumentacja"}`
                  : analysisData?.dimensions_mm
                  ? `Wymiary: ${analysisData.dimensions_mm[0]}×${analysisData.dimensions_mm[1]}×${analysisData.dimensions_mm[2]} mm`
                  : "Stół roboczy: 256×256×256 mm"}
              </span>
              <span>
                {analysisData && analysisData.instant_pricing === false
                  ? "Standard: JLCPCB / PCBWay"
                  : "Dokładność: ±0.1 mm"}
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* SEKCJA: SPECYFIKACJA TECHNICZNA WYBRANEGO MATERIAŁU               */}
        {/* ================================================================= */}
        {/* ================================================================= */}
        {/* DOLNY RZĄD: PEŁNA SZEROKOŚĆ (KARTA MATERIAŁOWA & DFM)             */}
        {/* ================================================================= */}
        <div id="materialy" className="w-full bg-white rounded-3xl border border-slate-200/80 shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-[#EF4444]" />
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#EF4444]">
                  Karta Materiałowa & DFM
                </span>
              </div>
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight flex flex-wrap items-center gap-2.5">
                <span>Specyfikacja wybranego materiału:</span>
                <span className="text-[#EF4444]">{matConfig.name}</span>
                {matConfig.badge && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {matConfig.badge}
                  </span>
                )}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70">
                Cena bazowa: <strong>{matConfig.pricePerCm3.toFixed(2)} zł/cm³</strong>
              </span>
              <span className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/70">
                Gęstość: <strong>{matConfig.density || 1.24} g/cm³</strong>
              </span>
            </div>
          </div>

          {/* 3 KOLUMNY WEWNĄTRZ NA PEŁNĄ SZEROKOŚĆ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Kolumna 1: Opis i charakterystyka */}
            <div className="space-y-3.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Charakterystyka inżynieryjna
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed font-normal">
                {matConfig.desc}
              </p>
              <div className="pt-2 flex flex-wrap gap-1.5">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
                  Grupa: {matConfig.group === "tech" ? "Techniczny" : matConfig.group === "composite" ? "Kompozyt" : matConfig.group === "flex" ? "Elastyczny" : "Standard"}
                </span>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-red-50 text-[#EF4444]">
                  Druk precyzyjny FDM
                </span>
              </div>
            </div>

            {/* Kolumna 2: Paski i wskaźniki właściwości fizykochemicznych */}
            <div className="bg-slate-50/90 rounded-2xl p-4 md:p-5 border border-slate-200/70 space-y-3.5">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Właściwości fizykochemiczne
              </h3>

              {/* HDT */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Odporność termiczna (HDT)</span>
                  <span className="text-slate-900 font-extrabold">{matConfig.hdt || "55°C"}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(
                        100,
                        (parseInt(matConfig.hdt || "55") / 125) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Odporność UV */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Odporność UV & Czynniki</span>
                  <span className="text-slate-900 font-extrabold">{matConfig.uvResistance || "Średnia"}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width:
                        matConfig.uvResistance?.includes("Maksymalna")
                          ? "100%"
                          : matConfig.uvResistance?.includes("Dobra")
                          ? "75%"
                          : "45%",
                    }}
                  />
                </div>
              </div>

              {/* Sztywność / Udarność */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Sztywność i udarność</span>
                  <span className="text-slate-900 font-extrabold">{matConfig.tensileStrength || "Wysoka"}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width:
                        matConfig.tensileStrength?.includes("Ekstremalna")
                          ? "100%"
                          : matConfig.tensileStrength?.includes("Bardzo wysoka")
                          ? "85%"
                          : "65%",
                    }}
                  />
                </div>
              </div>

              {/* Odporność chemiczna */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600">Odporność chemiczna</span>
                  <span className="text-slate-900 font-extrabold truncate max-w-[130px]">{chemicalResistance}</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-purple-500 h-full rounded-full transition-all duration-300"
                    style={{
                      width:
                        chemicalResistance?.includes("Ekstremalna")
                          ? "100%"
                          : chemicalResistance?.includes("Wysoka")
                          ? "80%"
                          : "50%",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Kolumna 3: Rekomendowane zastosowania */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Rekomendowane zastosowania
              </h3>
              <div className="flex flex-col gap-2">
                {recommendedApps.map((app, idx) => (
                  <div
                    key={idx}
                    className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700 flex items-center gap-2"
                  >
                    <span className="text-[#EF4444] font-bold">✓</span>
                    <span>{app}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </main>

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