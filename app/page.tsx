// app/page.tsx
"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useCallback,
  CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../src/lib/supabase";
import {
  normalizePackId,
  setPacksCache,
  type PackId,
  type QuestionPack,
} from "@/lib/questionPacks";
import { ComicBackground } from "@/components/ComicBackground";
import { trackGameEvent } from "@/lib/analytics";

interface StreamItem {
  id: string;
  title: string;
  url: string;
  scheduled_at: string;
  is_live: boolean;
}

function formatStreamDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const dayLabel = isToday
    ? "Сегодня"
    : isTomorrow
      ? "Завтра"
      : d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dayLabel}, ${time}`;
}

export default function HomePage() {
  return (
    <Suspense>
      <HomePageInner />
    </Suspense>
  );
}

function HomePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cardsVisible, setCardsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isSoundOn, setIsSoundOn] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [showStreamsModal, setShowStreamsModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [streams, setStreams] = useState<StreamItem[]>([]);
  const [streamsLoading, setStreamsLoading] = useState(false);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [panelStage, setPanelStage] = useState<0 | 1 | 2 | 3>(0);
  const panelTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayAttemptedRef = useRef(false);
  const [roomsToday, setRoomsToday] = useState(0);
  const [playersToday, setPlayersToday] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isAnimationsDisabled, setIsAnimationsDisabled] = useState(false);

  useEffect(() => {
    setIsAnimationsDisabled(
      localStorage.getItem("vecherinkach_animations_disabled") === "true",
    );
  }, []);

  useEffect(() => {
    const checkMobile = () => {
      const isPortrait = window.matchMedia("(orientation: portrait)").matches;
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isPortrait || isSmallScreen);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const [packCards, setPackCards] = useState<
    Array<{ id: PackId; title: string; description: string; badge?: string }>
  >([
    {
      id: "classic",
      title: "Классический",
      description: "Оригинальный пакет вопросов.",
      badge: "бесплатно",
    },
    {
      id: "03012026",
      title: "Пакет от 16.01.2026",
      description: "Альтернативный пакет вопросов",
      badge: "бесплатно",
    },
  ]);

  // Load packs from API and handle ?pack= query param
  useEffect(() => {
    fetch("/api/packs")
      .then((r) => r.json())
      .then((data: QuestionPack[]) => {
        if (!Array.isArray(data) || data.length === 0) return;
        setPacksCache(data);
        const publicPacks = data.filter((p) => p.is_public);
        if (publicPacks.length > 0) {
          setPackCards(
            publicPacks.map((p) => ({
              id: p.id,
              title: p.label,
              description: p.description || "",
              badge: "бесплатно",
            })),
          );
        }
      })
      .catch(() => {});

    const packParam = searchParams.get("pack");
    if (packParam) {
      const pid = normalizePackId(packParam);
      trackGameEvent("home_pack_deeplink", { packId: pid });
      localStorage.setItem("hostPackId", pid);
      router.push("/host");
    }
  }, [searchParams, router]);

  const partyGames: Array<{
    id:
      | "uno"
      | "risunkach"
      | "jokester"
      | "creativach"
      | "survivach"
      | "vecherinkach";
    title: string;
    subtitle: string;
    description: string;
    badge?: string;
    isSoon?: boolean;
    version?: string;
  }> = [
    {
      id: "vecherinkach",
      title: "Вечеринкач",
      subtitle: "Флагманская квиз-вечеринка",
      description:
        "Главная игра проекта: вопросы, раунды, голосования и ведущий экран для большой компании.",
      badge: "хит",
      version: "classic",
    },
    {
      id: "survivach",
      title: "Выживач",
      subtitle: "Зомби-гонка на выбывание",
      description:
        "Настольная битва с клетками, жизнями, кармой, дуэлями и напряжённым блицем до финиша.",
      badge: "новинка",
      version: "party",
    },
    {
      id: "uno",
      title: "UNO",
      subtitle: "Карточная мини-игра",
      description:
        "Четыре режима: классика, классика+глаголы, все формы, угадай глагол (TTS позже).",
      badge: "beta",
    },
    {
      id: "risunkach",
      title: "Рисункач",
      subtitle: "Мини-игра на рисунки",
      description: "Рисуй, угадывай, голосуй! 3 раунда цепочек превращений.",
      badge: "beta",
    },
    {
      id: "jokester",
      title: "Пошути-кач",
      subtitle: "Битва юмора",
      description:
        "Дуэли шуток! Отвечай смешно на каверзные вопросы, голосуй и побеждай.",
      badge: "тестирование",
    },
    {
      id: "creativach",
      title: "Креативач",
      subtitle: "Креативная битва",
      description: "Расшифровки, оправдания, анти-реклама и комплименты!",
      badge: "beta",
    },
  ];

  const choosePackAndGoHost = (nextPackId: PackId) => {
    trackGameEvent("home_pack_select", { packId: nextPackId });
    localStorage.setItem("hostPackId", nextPackId);
    navigateWithExit(() => router.push("/host"));
  };

  const handlePartyGameClick = (
    gameId:
      | "uno"
      | "risunkach"
      | "jokester"
      | "creativach"
      | "survivach"
      | "vecherinkach",
  ) => {
    trackGameEvent("home_minigame_open", { gameId });
    if (gameId === "vecherinkach") {
      choosePackAndGoHost("classic");
    } else if (gameId === "survivach") {
      navigateWithExit(() => router.push("/survivach"));
    } else if (gameId === "uno") {
      navigateWithExit(() => router.push("/uno"));
    } else if (gameId === "risunkach") {
      navigateWithExit(() => router.push("/draw"));
    } else if (gameId === "jokester") {
      navigateWithExit(() => router.push("/jokester"));
    } else if (gameId === "creativach") {
      navigateWithExit(() => router.push("/creativach"));
    }
  };

  const handleUserInteraction = () => {
    if (!hasUserInteracted) {
      setHasUserInteracted(true);
    }
  };

  const [buttonAnimating, setButtonAnimating] = useState(false);
  const meetAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMeetPlaying, setIsMeetPlaying] = useState(false);

  const fadeVolume = (
    audio: HTMLAudioElement,
    targetVolume: number,
    duration: number,
  ) => {
    const startVolume = audio.volume;
    const volumeDiff = targetVolume - startVolume;
    const steps = 50; // количество шагов для плавности
    const stepDuration = duration / steps;
    let currentStep = 0;

    const fadeStep = () => {
      currentStep++;
      const progress = currentStep / steps;
      audio.volume = startVolume + volumeDiff * progress;

      if (currentStep < steps) {
        setTimeout(fadeStep, stepDuration);
      }
    };

    fadeStep();
  };

  const YANDEX_AUDIO_BASE =
    process.env.NEXT_PUBLIC_AUDIO_BASE ??
    "https://storage.yandexcloud.net/vecherinkach/audio";
  const playRandomMeet = () => {
    const meetFiles = ["1.mp3", "2.mp3", "3.mp3", "4.mp3"];
    const randomFile = meetFiles[Math.floor(Math.random() * meetFiles.length)];
    const audio = new Audio(`${YANDEX_AUDIO_BASE}/meet1/${randomFile}`);
    audio.volume = 0.6;
    meetAudioRef.current = audio;
    setIsMeetPlaying(true);

    // Приглушить основную музыку
    const jingleAudio = audioRef.current;
    if (jingleAudio) {
      const originalVolume = jingleAudio.volume;
      fadeVolume(jingleAudio, originalVolume * 0.4, 1000); // 60% тише за 1 секунду

      // Вернуть громкость когда meet закончится
      audio.onended = () => {
        fadeVolume(jingleAudio, originalVolume, 1000);
        setIsMeetPlaying(false);
      };
    } else {
      audio.onended = () => setIsMeetPlaying(false);
    }

    audio.play().catch((err) => {
      console.error("Meet audio play error:", err);
      setIsMeetPlaying(false);
    });
  };

  const handleStart = () => {
    trackGameEvent("home_start_click");
    setButtonAnimating(true);
    setTimeout(() => {
      setHasStarted(true);
      setPanelStage(0);
      setCardsVisible(false);
      handleToggleSound();
      setButtonAnimating(false);
    }, 600); // Длительность анимации кнопки
  };

  const stopAudio = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
    setIsSoundOn(false);
    setAudioError("");
  };

  const tryAutoPlay = useCallback(async (audio: HTMLAudioElement) => {
    if (autoPlayAttemptedRef.current) {
      return;
    }

    autoPlayAttemptedRef.current = true;
    audio.muted = true;
    const previousVolume = audio.volume;
    audio.volume = 0;

    try {
      await audio.play();
      audio.muted = false;
      audio.volume = previousVolume || 0.45;
      setIsSoundOn(true);
      setAudioError("");
    } catch (err) {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = previousVolume || 0.45;
      const message =
        err instanceof Error
          ? err.message
          : "Нажмите кнопку, чтобы включить музыку";
      setAudioError(message);
    }
  }, []);

  const navigateWithExit = (callback: () => void) => {
    if (isExiting) {
      return;
    }
    setIsExiting(true);
    setCardsVisible(false);
    stopAudio();
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
    }
    exitTimeoutRef.current = setTimeout(() => {
      callback();
    }, 350);
  };

  useEffect(() => {
    panelTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    panelTimeoutsRef.current = [];

    if (!hasStarted) {
      setPanelStage(0);
      setCardsVisible(false);
      return;
    }

    setPanelStage(0);
    setCardsVisible(false);

    // Ступенчатое появление панелей после нажатия "НАЧАТЬ ВЕСЕЛУХУ"
    panelTimeoutsRef.current.push(
      setTimeout(() => setPanelStage(3), 30),
      setTimeout(() => setCardsVisible(true), 330),
    );

    return () => {
      panelTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
      panelTimeoutsRef.current = [];
    };
  }, [hasStarted]);

  const panelEnterClass = (isVisible: boolean) =>
    `transition-all duration-700 ease-out transform ${isVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95 pointer-events-none"}`;

  const panelEnterStyle = (
    isVisible: boolean,
    delayMs: number,
  ): CSSProperties => ({
    transitionDelay: isVisible ? `${delayMs}ms` : "0ms",
  });

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const audio = new Audio(
      `${process.env.NEXT_PUBLIC_AUDIO_BASE ?? "https://storage.yandexcloud.net/vecherinkach/audio"}/sound/jingle-main.mp3`,
    );
    audio.loop = true;
    audio.volume = 0.45;
    audioRef.current = audio;

    if (hasUserInteracted) {
      const autoPlayTimer = window.setTimeout(() => {
        tryAutoPlay(audio);
      }, 0);
      return () => {
        clearTimeout(autoPlayTimer);
        audio.pause();
        audioRef.current = null;
      };
    }

    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [tryAutoPlay, hasUserInteracted]);

  const handleToggleSound = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    setAudioError("");

    if (isSoundOn) {
      trackGameEvent("home_sound_toggle", { enabled: false, source: "manual" });
      stopAudio();
      return;
    }

    try {
      await audio.play();
      setIsSoundOn(true);
      trackGameEvent("home_sound_toggle", { enabled: true, source: "manual" });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Нужен жест пользователя, чтобы запустить аудио";
      setAudioError(message);
      trackGameEvent("home_sound_toggle_failed", { reason: "play_blocked" });
    }
  };

  const playersCountLabel = cardsVisible ? "4/8" : "0/8";
  const roomCodeDisplay = cardsVisible ? "CTRL" : "____";

  const EMOTION_MAX_ROOMS = 20;
  const emotionPercent = Math.max(
    0,
    Math.min(100, (roomsToday / EMOTION_MAX_ROOMS) * 100),
  );

  const emotionEmoji = (() => {
    if (emotionPercent < 20) return "😢";
    if (emotionPercent < 40) return "🙁";
    if (emotionPercent < 60) return "😐";
    if (emotionPercent < 80) return "🙂";
    return "😄";
  })();

  const openStreamsModal = async () => {
    setShowStreamsModal(true);
    setStreamsLoading(true);
    try {
      const res = await fetch("/api/streams");
      if (res.ok) setStreams(await res.json());
    } catch (e) {
      console.error("Failed to load streams:", e);
    } finally {
      setStreamsLoading(false);
    }
  };

  const hasLiveStream = streams.some((s) => s.is_live);

  useEffect(() => {
    // Pre-fetch streams for live badge
    fetch("/api/streams")
      .then((r) => (r.ok ? r.json() : []))
      .then(setStreams)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const today = new Date();
        const startOfDay = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        ).toISOString();

        // Количество комнат созданных сегодня
        const { count: roomsCount } = await supabase
          .from("rooms")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startOfDay);

        // Количество игроков созданных сегодня
        const { count: playersCount } = await supabase
          .from("players")
          .select("*", { count: "exact", head: true })
          .gte("joined_at", startOfDay);

        setRoomsToday(roomsCount || 0);
        setPlayersToday(playersCount || 0);
      } catch (error) {
        console.error("Error loading stats:", error);
      }
    };

    loadStats();
  }, []);

  return (
    <div
      className={`min-h-screen text-[#142a45] relative z-10 ${isAnimationsDisabled ? "disable-animations" : ""}`}
      onClick={handleUserInteraction}
    >
      <ComicBackground />
      {!hasStarted ? (
        <div className="min-h-screen flex flex-col items-center justify-center gap-6">
          <div className="text-center space-y-4">
            <button
              onClick={handleStart}
              className={`comic-button px-8 py-4 text-2xl bg-[#ffde00] text-[#000] hover:bg-[#ffea00] transition-all duration-500 ${buttonAnimating ? "scale-110 bg-[#f1532f] shadow-2xl" : ""}`}
            >
              НАЧАТЬ ВЕСЕЛУХУ
            </button>
            <p className="comic-font text-sm text-[#142a45] max-w-md mx-auto leading-relaxed">
              Если ты здесь — значит, твоя лента уже проиграла. Пора перейти в
              режим "веселухи".
            </p>
          </div>
          <div className="text-center space-y-4">
            <button
              onClick={() => {
                const next = !isAnimationsDisabled;
                setIsAnimationsDisabled(next);
                localStorage.setItem(
                  "vecherinkach_animations_disabled",
                  String(next),
                );
                trackGameEvent("home_animations_toggle", { enabled: !next });
              }}
              className={`comic-button px-6 py-3 text-lg border-[4px] border-black transition-colors ${isAnimationsDisabled ? "bg-yellow-400 text-black" : "bg-white text-black hover:bg-gray-100"}`}
            >
              {isAnimationsDisabled
                ? "✨ Анимации выключены"
                : "✨ Отключить анимации"}
            </button>
            <p className="comic-font text-sm text-[#142a45] max-w-md mx-auto leading-relaxed">
              чтобы сэкономить оперативку и избежать лагов, особенно на ТВ или
              старых устройствах. Игра останется такой же весёлой — просто без
              "фейерверков".
            </p>
          </div>
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-[100dvh] flex flex-col justify-start py-2 lg:py-3 gap-2">
          <div
            className={panelEnterClass(panelStage >= 1)}
            style={panelEnterStyle(panelStage >= 1, 0)}
          >
            <header className="comic-panel bg-[#ff2a2a] text-[#fff] px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="comic-font text-xs tracking-[0.5em]">
                  Редактор квиза
                </p>
                <h1 className="text-3xl sm:text-4xl comic-font leading-tight text-stroke-black">
                  Когнитивное программирование вечеринки
                </h1>
              </div>
              <div className="text-sm comic-font uppercase tracking-[0.3em]">
                v 2.1
              </div>
            </header>
          </div>

          <div
            className={panelEnterClass(panelStage >= 2)}
            style={panelEnterStyle(panelStage >= 2, 140)}
          >
            <section className="comic-panel bg-white p-4 sm:p-6 w-full flex-1 flex flex-col justify-center">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-xl sm:text-2xl font-black text-[#142a45] uppercase tracking-wide">
                  Коллекция игр
                </h2>
                <span className="text-xs font-semibold tracking-[0.3em] text-[#142a45]/70">
                  ПОЛНОЦЕННЫЕ ХИТЫ
                </span>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 h-full">
                {partyGames.map((game, index) => {
                  const isDisabled = Boolean(game.isSoon);
                  const isExitingState = isExiting
                    ? "scale-95 opacity-70"
                    : cardsVisible
                      ? "scale-100 opacity-100"
                      : "scale-95 opacity-0 translate-y-3";

                  const emoji =
                    game.id === "vecherinkach"
                      ? "🧠"
                      : game.id === "survivach"
                        ? "🔥"
                        : game.id === "uno"
                          ? "🃏"
                          : game.id === "risunkach"
                            ? "🎨"
                            : game.id === "jokester"
                              ? "🤡"
                              : game.id === "creativach"
                                ? "✍️"
                                : null;
                  const isFeatured =
                    game.id === "vecherinkach" || game.id === "survivach";
                  const cardTheme =
                    game.id === "vecherinkach"
                      ? "from-[#7c3aed] via-[#db2777] to-[#f97316]"
                      : game.id === "survivach"
                        ? "from-[#164e28] via-[#16a34a] to-[#84cc16]"
                        : game.id === "uno"
                          ? "from-[#2563eb] via-[#4f46e5] to-[#7c3aed]"
                          : game.id === "risunkach"
                            ? "from-[#0891b2] via-[#06b6d4] to-[#22c55e]"
                            : game.id === "jokester"
                              ? "from-[#f59e0b] via-[#f97316] to-[#ef4444]"
                              : "from-[#9333ea] via-[#ec4899] to-[#f43f5e]";

                  return (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => handlePartyGameClick(game.id)}
                      disabled={isDisabled}
                      className={`group relative overflow-hidden rounded-3xl border-[3px] border-[#142a45] p-4 flex flex-col justify-between items-start text-left gap-2 min-h-[150px] ${isMobile ? "h-full" : "h-[205px]"} transition-all duration-300 hover:scale-[1.035] hover:-translate-y-1 hover:shadow-[8px_8px_0_#142a45] ${isFeatured ? `bg-gradient-to-br ${cardTheme} text-white shadow-[6px_6px_0_#142a45]` : "bg-[#fff] text-[#142a45] shadow-[4px_4px_0_rgba(20,42,69,0.25)]"} ${isDisabled ? "opacity-50 cursor-not-allowed" : ""} ${isExitingState}`}
                      style={{ transitionDelay: `${index * 50}ms` }}
                    >
                      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.35),transparent_35%)]" />
                      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-white/20 blur-2xl" />

                      <div className="relative z-10 w-full">
                        <p className={`retro-heading text-[10px] sm:text-xs tracking-[0.2em] truncate ${isFeatured ? "text-white/75" : "text-[#142a45]/70"}`}>
                          {game.subtitle}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {emoji && (
                            <span
                              className={`text-xl sm:text-2xl ${isFeatured ? "drop-shadow-[2px_2px_0_rgba(0,0,0,0.35)]" : ""}`}
                              aria-hidden="true"
                            >
                              {emoji}
                            </span>
                          )}
                          <h3 className={`text-lg sm:text-xl font-black leading-none ${isFeatured ? "text-white drop-shadow-[2px_2px_0_rgba(0,0,0,0.35)]" : "text-[#142a45]"}`}>
                            {game.title}
                          </h3>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {game.badge && (
                            <span className={`rounded-full border-[2px] px-2 py-0.5 text-[10px] font-black tracking-widest ${isFeatured ? "border-white/80 bg-white/20 text-white backdrop-blur-sm" : "border-[#142a45] bg-[#ffe184] text-[#142a45]"}`}>
                              {game.badge}
                            </span>
                          )}
                          {game.version && (
                            <span className={`rounded-full border-[2px] px-2 py-0.5 text-[10px] font-black tracking-widest ${isFeatured ? "border-white/50 bg-black/15 text-white" : "border-[#142a45] bg-[#eef5fc] text-[#142a45]"}`}>
                              {game.version}
                            </span>
                          )}
                        </div>
                      </div>

                      {!isMobile && (
                        <p className={`relative z-10 text-xs sm:text-sm line-clamp-4 leading-snug ${isFeatured ? "text-white/90" : "text-[#142a45]/80"}`}>
                          {game.description}
                        </p>
                      )}

                      <div className={`relative z-10 flex items-center gap-2 text-[10px] sm:text-xs font-black w-full mt-auto ${isFeatured ? "text-white" : "text-[#1f6ac6]"}`}>
                        <span className="truncate flex-1">
                          {game.id === "vecherinkach"
                            ? "запустить классику"
                            : game.id === "survivach"
                            ? "настроить и играть"
                            : game.id === "uno"
                              ? "4 режима"
                              : game.id === "risunkach"
                                ? "3 уровня"
                                : "играть"}
                        </span>
                        <span className={`shrink-0 grid h-7 w-7 place-items-center rounded-full border-2 transition-transform group-hover:translate-x-1 ${isFeatured ? "border-white/70 bg-white/20" : "border-[#142a45] bg-[#ffe184]"}`}>
                          {game.isSoon ? "🔒" : "▶"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>

      <div
        className={panelEnterClass(panelStage >= 3)}
        style={panelEnterStyle(panelStage >= 3, 280)}
      >
        <section className="comic-panel bg-[#00c3ff] p-4">
          <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] w-full">
              <div className="comic-panel bg-[#fff] p-4 space-y-4 h-full">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="comic-font text-xs tracking-[0.4em] text-[#142a45]/70">
                      вечеринкач
                    </p>
                    <p className="text-2xl comic-font text-[#142a45]">
                      Панель управления
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs comic-font tracking-[0.3em] bg-[#ffde00] text-[#000] border-2 border-black animate-pulse">
                    LIVE
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm comic-font">
                  <button
                    type="button"
                    onClick={openStreamsModal}
                    className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white hover:bg-[#ffe184] transition-colors relative"
                  >
                    📺 Трансляции
                    {hasLiveStream && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-black animate-pulse" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      trackGameEvent("home_donate_click", {
                        provider: "donatty",
                      });
                      window.open("https://donatty.com/aleksandri", "_blank");
                    }}
                    className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white hover:bg-[#ffe184] transition-colors"
                  >
                    Поддержать
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      trackGameEvent("home_contact_open");
                      setShowContactModal(true);
                    }}
                    className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white hover:bg-[#ffe184] transition-colors"
                  >
                    Связаться
                  </button>
                  <a
                    href="/pricing"
                    className="px-4 py-2 rounded-full border-2 border-[#142a45] bg-white hover:bg-[#ffe184] transition-colors"
                  >
                    Купить
                  </a>
                </div>
              </div>

              <div className="rounded-3xl border-[3px] border-[#142a45] bg-[#fff2c8] p-4 space-y-3 h-full flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <p className="retro-heading text-xs tracking-[0.4em] text-[#142a45]/70">
                    Аудио канал
                  </p>
                  <span className="text-sm font-semibold text-[#1f6ac6]">
                    Lobby loop
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleToggleSound}
                    className={`hover:scale-105 hover:shadow-lg transition-all duration-200 inline-flex items-center justify-between rounded-2xl border-[3px] border-[#142a45] px-4 py-3 font-semibold ${isSoundOn ? "bg-[#142a45] text-[#ffeccd]" : "bg-white text-[#142a45]"}`}
                  >
                    {isSoundOn ? "🔊 Джингл включён" : "🎵 Включить джингл"}
                    <span className="text-xs tracking-[0.3em]">AUTO</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isAnimationsDisabled;
                      setIsAnimationsDisabled(next);
                      localStorage.setItem(
                        "vecherinkach_animations_disabled",
                        String(next),
                      );
                      trackGameEvent("home_animations_toggle", {
                        enabled: !next,
                      });
                    }}
                    className={`hover:scale-105 hover:shadow-lg transition-all duration-200 inline-flex items-center justify-between rounded-2xl border-[3px] border-[#142a45] px-4 py-3 font-semibold ${isAnimationsDisabled ? "bg-yellow-400 text-black" : "bg-white text-[#142a45]"}`}
                  >
                    {isAnimationsDisabled
                      ? "✨ Анимации выключены"
                      : "✨ Отключить анимации"}
                    <span className="text-xs tracking-[0.3em]">UI</span>
                  </button>
                  {audioError && (
                    <span className="text-xs text-[#b23324] font-semibold">
                      {audioError}
                    </span>
                  )}
                </div>
              </div>
          </div>
        </section>
      </div>

      {/* Отдельная панель выбора пакета вопросов */}
        </div>
      )}

      {/* Streams modal */}
      {showStreamsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowStreamsModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-lg rounded-3xl border-[4px] border-[#142a45] bg-white shadow-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-[#142a45]">
                📺 Трансляции
              </h2>
              <button
                onClick={() => setShowStreamsModal(false)}
                className="text-2xl text-[#142a45] hover:text-red-500 transition-colors"
              >
                ✕
              </button>
            </div>

            {streamsLoading ? (
              <div className="text-center py-8 text-[#142a45]/60 font-semibold">
                Загрузка...
              </div>
            ) : streams.length === 0 ? (
              <div className="text-center py-8 text-[#142a45]/60 font-semibold">
                Пока нет запланированных трансляций
              </div>
            ) : (
              <div className="space-y-3">
                {streams.map((s) => (
                  <a
                    key={s.id}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-2xl border-[3px] border-[#142a45] p-4 hover:bg-[#f0f0ff] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-[#142a45] text-lg">
                            {s.title}
                          </span>
                          {s.is_live && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-red-500 text-white border-2 border-black animate-pulse">
                              LIVE
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-[#142a45]/70 mt-1">
                          {formatStreamDate(s.scheduled_at)}
                        </div>
                        <div className="text-xs text-blue-600 underline mt-1 truncate">
                          {s.url}
                        </div>
                      </div>
                      <span className="text-xl shrink-0">▶</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact modal */}
      {showContactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowContactModal(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-lg rounded-3xl border-[4px] border-[#142a45] bg-white shadow-2xl p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-[#142a45]">
                📬 Связаться
              </h2>
              <button
                onClick={() => setShowContactModal(false)}
                className="text-2xl text-[#142a45] hover:text-red-500 transition-colors"
              >
                ✕
              </button>
            </div>

            <p className="text-[#142a45] leading-relaxed font-medium">
              Открыт к предложениям! Делаю индивидуальные пакеты вопросов,
              фирменные игры под вашу компанию, мероприятия и праздники. Пишите
              - обсудим идею и соберем игру под вас.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <a
                href="https://vk.com/aialekz"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackGameEvent("home_contact_link_click", { provider: "vk" })
                }
                className="rounded-2xl border-[3px] border-[#142a45] bg-[#e8f4ff] px-4 py-3 font-black text-[#142a45] text-center hover:bg-[#d9ecff] transition-colors"
              >
                VK: vk.com/aialekz
              </a>
              <a
                href="https://t.me/Al_ivStudio"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  trackGameEvent("home_contact_link_click", {
                    provider: "telegram",
                  })
                }
                className="rounded-2xl border-[3px] border-[#142a45] bg-[#e8f4ff] px-4 py-3 font-black text-[#142a45] text-center hover:bg-[#d9ecff] transition-colors"
              >
                Telegram: @Al_ivStudio
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
