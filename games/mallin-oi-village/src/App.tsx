import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import VillageScene, { MovementInput } from "./VillageScene";
import {
  calendarEvents,
  facilities,
  FacilityId,
  samplePosts,
  shopItems,
  skins,
  sleepingResidents,
} from "./data";
import {
  loadPublicPlayerEquipment,
  ownerFallbackEquipment,
} from "./services/mallinoi-api";

type PanelProps = {
  id: FacilityId;
  coins: number;
  onClose: () => void;
  onNavigate: (id: FacilityId) => void;
  onPurchase: (price: number, name: string) => void;
  onToast: (message: string) => void;
  currentSkin: string;
};

function PanelFrame({
  icon,
  title,
  subtitle,
  onClose,
  children,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="panel-backdrop" role="presentation" onPointerDown={onClose}>
      <section
        className="game-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="panel-header">
          <div className="panel-icon">{icon}</div>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button className="panel-close" type="button" onClick={onClose} aria-label="닫기">×</button>
        </header>
        <div className="panel-body">{children}</div>
      </section>
    </div>
  );
}

function TownHall({ onNavigate }: { onNavigate: (id: FacilityId) => void }) {
  return (
    <div className="town-hall-layout">
      <div className="notice-paper">
        <span className="paper-pin">●</span>
        <small>오늘의 마을 소식</small>
        <h3>어서 와요, 말오닷 주인장!</h3>
        <p>주민 셋은 집에서 자는 중이고, 광장에는 두 명이 산책하고 있어요.</p>
        <div className="quest-row">
          <span>오늘의 산책</span><b>2 / 4 시설</b>
          <i><em /></i>
        </div>
      </div>
      <div className="service-grid">
        {facilities.filter((facility) => ["board", "write", "store", "calendar"].includes(facility.id)).map((facility) => (
          <button key={facility.id} type="button" onClick={() => onNavigate(facility.id)}>
            <span>{facility.icon}</span>
            <b>{facility.shortName}</b>
            <small>{facility.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function BoardPanel({ onToast }: { onToast: (message: string) => void }) {
  return (
    <div className="post-list">
      <div className="panel-filter-row">
        <button className="filter-active" type="button">전체</button>
        <button type="button">인기</button>
        <button type="button">내 이웃</button>
        <span>새 글 4개</span>
      </div>
      {samplePosts.map((post) => (
        <button className="post-card" type="button" key={post.title} onClick={() => onToast(`“${post.title}” 게시물을 열었어요`)}>
          <span className="post-category">{post.category}</span>
          <div>
            <h3>{post.title}</h3>
            <p>{post.author} · {post.meta}</p>
          </div>
          <b>›</b>
        </button>
      ))}
    </div>
  );
}

function WritePanel({ onToast }: { onToast: (message: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const publish = () => {
    if (!title.trim() || !body.trim()) {
      onToast("제목과 내용을 조금만 더 적어주세요");
      return;
    }
    setTitle("");
    setBody("");
    onToast("마을 게시판에 새 글을 붙였어요!");
  };
  return (
    <div className="write-desk">
      <div className="write-tools">
        <button type="button">자유게시판⌄</button>
        <span>🌿 편안한 말투</span>
      </div>
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="어떤 이야기를 남길까요?" maxLength={60} />
      <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="마을 주민들과 나누고 싶은 이야기를 적어보세요." maxLength={800} />
      <footer>
        <div><button type="button">📷 사진</button><button type="button">😊 이모티콘</button></div>
        <button className="primary-game-button" type="button" onClick={publish}>게시하기</button>
      </footer>
    </div>
  );
}

function StorePanel({ coins, onPurchase }: { coins: number; onPurchase: (price: number, name: string) => void }) {
  return (
    <div className="store-layout">
      <aside className="store-clerk">
        <img src="/characters/tomato.png" alt="오이상점 주인 토마토" />
        <div><b>어서 와!</b><span>오늘은 반짝이는 효과가 잘 나가.</span></div>
      </aside>
      <div className="store-shelf">
        <div className="coin-balance">🥒 보유 피클 <b>{coins.toLocaleString()}</b></div>
        <div className="item-grid">
          {shopItems.map((item) => (
            <article key={item.id}>
              <div>{item.icon}</div>
              <b>{item.name}</b>
              <span>{item.owned ? "보유 중" : `🥒 ${item.price}`}</span>
              <button type="button" disabled={item.owned} onClick={() => onPurchase(item.price, item.name)}>
                {item.owned ? "장착됨" : "구매"}
              </button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarPanel() {
  const blanks = ["", "", "", "", "", ""];
  const days = Array.from({ length: 31 }, (_, index) => index + 1);
  return (
    <div className="calendar-layout">
      <section className="mini-calendar">
        <header><button type="button">‹</button><h3>2026년 8월</h3><button type="button">›</button></header>
        <div className="weekdays">{["일", "월", "화", "수", "목", "금", "토"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-days">
          {blanks.map((_, index) => <span key={`blank-${index}`} />)}
          {days.map((day) => (
            <button
              type="button"
              key={day}
              className={`${day === 6 ? "today" : ""} ${[8, 12, 15].includes(day) ? "has-event" : ""}`}
            >{day}</button>
          ))}
        </div>
      </section>
      <section className="event-list">
        <div className="event-title"><div><small>UPCOMING</small><h3>다가오는 일정</h3></div><button type="button">＋ 일정</button></div>
        {calendarEvents.map((event) => (
          <article key={event.day}>
            <div style={{ background: event.color }}><small>8월</small><b>{event.day}</b></div>
            <span><b>{event.title}</b><small>{event.time}</small></span>
          </article>
        ))}
      </section>
    </div>
  );
}

function HousePanel({ currentSkin, onToast }: { currentSkin: string; onToast: (message: string) => void }) {
  return (
    <div className="house-room">
      <div className="room-window"><span>☁</span><span>☀</span></div>
      <div className="room-shelf"><i /><i /><i /></div>
      <div className="room-rug" />
      <div className="room-bed"><span /><img src={currentSkin} alt="말오닷 주인장 캐릭터" /></div>
      <div className="room-table"><span>🌱</span></div>
      <aside>
        <span>MY HOME · 01</span>
        <h3>말오닷 주인장의 집</h3>
        <p>다음 단계에서는 가구 배치, 벽지, 바닥, 손님 초대 기능을 연결해요.</p>
        <button type="button" onClick={() => onToast("집 꾸미기는 다음 업데이트에서 열려요")}>🔨 집 꾸미기 준비 중</button>
      </aside>
    </div>
  );
}

function ResidentsPanel() {
  return (
    <div className="resident-roster">
      <div className="roster-summary"><b>현재 마을 인구 6명</b><span>온라인 3 · 수면 중 3</span></div>
      {sleepingResidents.map((resident) => (
        <article key={resident.name}>
          <img src={resident.src} alt="" />
          <span><b>{resident.name}</b><small>집 침대에서 쉬는 중</small></span>
          <em>Zzz</em>
        </article>
      ))}
      <p>가입한 모든 계정에는 기본 집 한 채가 자동으로 생기는 구조로 설계했어요.</p>
    </div>
  );
}

function FacilityPanel({ id, coins, onClose, onNavigate, onPurchase, onToast, currentSkin }: PanelProps) {
  const facility = facilities.find((item) => item.id === id);
  const frame = facility ?? {
    icon: "🗺️",
    name: "주민 명부",
    description: "마을 주민들의 현재 상태를 확인해요.",
  };
  return (
    <PanelFrame icon={frame.icon} title={frame.name} subtitle={frame.description} onClose={onClose}>
      {id === "town-hall" && <TownHall onNavigate={onNavigate} />}
      {id === "board" && <BoardPanel onToast={onToast} />}
      {id === "write" && <WritePanel onToast={onToast} />}
      {id === "store" && <StorePanel coins={coins} onPurchase={onPurchase} />}
      {id === "calendar" && <CalendarPanel />}
      {id === "host-house" && <HousePanel currentSkin={currentSkin} onToast={onToast} />}
      {id === "map" && <ResidentsPanel />}
    </PanelFrame>
  );
}

function VillageMap({ onClose, onSelect }: { onClose: () => void; onSelect: (id: FacilityId) => void }) {
  return (
    <div className="map-popover">
      <header><div><small>SPECIAL CITY GUIDE</small><h2>말오닷특별시 지도</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="map-board">
        <span className="map-river" />
        <span className="map-road map-road-a" />
        <span className="map-road map-road-b" />
        {facilities.map((facility) => (
          <button
            type="button"
            key={facility.id}
            className={`map-pin pin-${facility.id}`}
            onClick={() => onSelect(facility.id)}
          ><span>{facility.icon}</span><b>{facility.shortName}</b></button>
        ))}
        <button type="button" className="map-pin pin-residents" onClick={() => onSelect("map")}><span>💤</span><b>주택가</b></button>
      </div>
      <p>시설을 누르면 바로 둘러볼 수 있어요. 실제 게임에서는 길찾기로 확장됩니다.</p>
    </div>
  );
}

function Inventory({
  currentSkin,
  effectName,
  onSelect,
  onClose,
}: {
  currentSkin: string;
  effectName: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="inventory-popover">
      <header><div><small>MY CLOSET</small><h2>캐릭터 옷장</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="skin-list">
        {skins.map((skin) => (
          <button type="button" key={skin.id} className={currentSkin === skin.id ? "selected" : ""} onClick={() => onSelect(skin.id)}>
            <img src={skin.src} alt="" /><span>{skin.name}</span>{currentSkin === skin.id && <i>✓</i>}
          </button>
        ))}
      </div>
      <div className="effect-slot"><span>🕸️</span><div><b>장착 효과</b><small>{effectName ?? "장착 효과 없음"}</small></div><em>{effectName ? "ON" : "OFF"}</em></div>
    </div>
  );
}

function Joystick({ inputRef }: { inputRef: React.MutableRefObject<MovementInput> }) {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const rect = baseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.31;
    const distance = Math.hypot(dx, dy) || 1;
    const clamp = Math.min(1, max / distance);
    const x = dx * clamp;
    const y = dy * clamp;
    setKnob({ x, y });
    inputRef.current = { x: x / max, y: y / max };
  };

  const release = () => {
    setKnob({ x: 0, y: 0 });
    inputRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      ref={baseRef}
      className="joystick"
      aria-label="이동 조이스틱"
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); update(event.clientX, event.clientY); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event.clientX, event.clientY); }}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}><i /></span>
      <b>RUN</b>
    </div>
  );
}

export default function App() {
  const inputRef = useRef<MovementInput>({ x: 0, y: 0 });
  const pressedKeys = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement>(null);
  const [nearest, setNearest] = useState<FacilityId | null>(null);
  const [panel, setPanel] = useState<FacilityId | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [currentSkin, setCurrentSkin] = useState("owner-kind");
  const [playerEquipment, setPlayerEquipment] = useState(ownerFallbackEquipment);
  const [coins, setCoins] = useState(1280);
  const [musicOn, setMusicOn] = useState(false);
  const [toast, setToast] = useState("화면 아래 스틱으로 마을을 달려보세요");

  const skinSrc = useMemo(
    () =>
      currentSkin === "owner-kind"
        ? playerEquipment.characterImageUrl
        : skins.find((skin) => skin.id === currentSkin)?.src ??
          playerEquipment.characterImageUrl,
    [currentSkin, playerEquipment.characterImageUrl],
  );
  const nearestFacility = facilities.find((facility) => facility.id === nearest) ?? null;

  const showToast = useCallback((message: string) => {
    setToast("");
    window.setTimeout(() => setToast(message), 20);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadPublicPlayerEquipment("말오닷 주인장", controller.signal)
      .then((equipment) => setPlayerEquipment(equipment))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        console.warn("[말오닷특별시] 공개 프로필을 불러오지 못해 내장 정보를 사용합니다.", error);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openPanel = useCallback((id: FacilityId) => {
    inputRef.current = { x: 0, y: 0 };
    setShowMap(false);
    setShowInventory(false);
    setPanel(id);
  }, []);

  const interact = useCallback(() => {
    if (panel) return;
    if (nearest) openPanel(nearest);
    else showToast("시설 가까이 가면 문을 열 수 있어요");
  }, [nearest, openPanel, panel, showToast]);

  useEffect(() => {
    const updateKeyboard = () => {
      const keys = pressedKeys.current;
      const x = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
      const y = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0);
      const length = Math.hypot(x, y) || 1;
      inputRef.current = { x: x / length, y: y / length };
    };
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(key)) {
        event.preventDefault();
        pressedKeys.current.add(key);
        updateKeyboard();
      }
      if ((key === "e" || key === "enter") && !event.repeat) interact();
      if (key === "escape") {
        setPanel(null);
        setShowMap(false);
        setShowInventory(false);
      }
    };
    const up = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.key.toLowerCase());
      updateKeyboard();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [interact]);

  const toggleMusic = async () => {
    if (!audioRef.current) return;
    if (musicOn) {
      audioRef.current.pause();
      setMusicOn(false);
      return;
    }
    try {
      audioRef.current.volume = 0.32;
      await audioRef.current.play();
      setMusicOn(true);
    } catch {
      showToast("소리를 켜려면 화면을 한 번 더 눌러주세요");
    }
  };

  const purchase = (price: number, name: string) => {
    if (coins < price) {
      showToast("피클이 조금 부족해요");
      return;
    }
    setCoins((current) => current - price);
    showToast(`${name}을(를) 가방에 담았어요!`);
  };

  return (
    <main className="game-shell">
      <VillageScene
        inputRef={inputRef}
        playerSkin={skinSrc}
        playerEffectSrc={playerEquipment.effectImageUrl}
        playerName={playerEquipment.nickname}
        onNearestChange={setNearest}
        onSelect={openPanel}
        onResidentHello={showToast}
      />
      <div className="sun-wash" />

      <header className="top-hud">
        <button className="profile-chip" type="button" onClick={() => setShowInventory((current) => !current)}>
          <span className="profile-avatar"><img src={playerEquipment.profileImageUrl} alt={`${playerEquipment.nickname} 프로필`} onError={(event) => { event.currentTarget.src = "/characters/cucumber.png"; }} /><i /></span>
          <span><b>{playerEquipment.nickname}</b><small>{playerEquipment.characterName} · {playerEquipment.skinName}</small></span>
        </button>
        <div className="world-status">
          <span className="weather-icon">☀</span>
          <span><b>8월 6일 목요일</b><small>오후 2:24 · 맑음</small></span>
        </div>
        <div className="top-actions">
          <button type="button" className="online-chip" onClick={() => openPanel("map")}><i /> 온라인 3</button>
          <button type="button" className="currency-chip" onClick={() => openPanel("store")}><span>🥒</span><b>{coins.toLocaleString()}</b></button>
          <button type="button" className="round-hud-button" onClick={toggleMusic} aria-label={musicOn ? "음악 끄기" : "음악 켜기"}>{musicOn ? "♫" : "♩"}</button>
        </div>
      </header>

      <aside className="quest-chip">
        <span>오늘의 마을 산책</span>
        <b>시설 2곳 둘러보기</b>
        <i><em /></i>
        <small>2 / 4</small>
      </aside>

      <div className="left-controls"><Joystick inputRef={inputRef} /></div>

      <div className={`nearby-prompt ${nearestFacility ? "visible" : ""}`}>
        <span>{nearestFacility?.icon ?? "🌿"}</span>
        <div><small>가까운 장소</small><b>{nearestFacility?.name ?? "산책로"}</b></div>
        <em>열기</em>
      </div>

      <nav className="right-controls" aria-label="게임 메뉴">
        <button type="button" onClick={() => { setShowMap((current) => !current); setShowInventory(false); }}><span>⌖</span><b>지도</b></button>
        <button type="button" onClick={() => { setShowInventory((current) => !current); setShowMap(false); }}><span>🎒</span><b>가방</b></button>
        <button className={`action-button ${nearest ? "ready" : ""}`} type="button" onClick={interact}><span>{nearest ? "↗" : "👋"}</span><b>{nearest ? "열기" : "인사"}</b></button>
      </nav>

      {showMap && <VillageMap onClose={() => setShowMap(false)} onSelect={openPanel} />}
      {showInventory && (
        <Inventory
          currentSkin={currentSkin}
          effectName={playerEquipment.effectName}
          onClose={() => setShowInventory(false)}
          onSelect={(id) => { setCurrentSkin(id); showToast("캐릭터를 갈아입었어요"); }}
        />
      )}
      {panel && (
        <FacilityPanel
          id={panel}
          coins={coins}
          onClose={() => setPanel(null)}
          onNavigate={openPanel}
          onPurchase={purchase}
          onToast={showToast}
          currentSkin={skinSrc}
        />
      )}

      {toast && <div className="game-toast"><span>🥒</span>{toast}</div>}
      <audio ref={audioRef} src="/audio/village-theme.mp3" loop preload="none" />

      <div className="landscape-gate">
        <span>↻</span>
        <h1>세로로 돌려주세요</h1>
        <p>말오닷특별시는 세로 화면에 맞춰 만든 카툰 마을이에요.</p>
      </div>
    </main>
  );
}
