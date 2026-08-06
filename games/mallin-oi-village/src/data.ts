export type FacilityId =
  | "town-hall"
  | "board"
  | "write"
  | "store"
  | "calendar"
  | "host-house"
  | "map";

export type Facility = {
  id: FacilityId;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  position: [number, number, number];
  color: string;
  roof: string;
};

export const facilities: Facility[] = [
  {
    id: "town-hall",
    name: "말오닷 회관",
    shortName: "회관",
    icon: "🏡",
    description: "마을 서비스와 오늘의 소식을 한눈에 확인해요.",
    position: [0, 0, -7],
    color: "#f6d584",
    roof: "#e36f50",
  },
  {
    id: "board",
    name: "모두의 우체국",
    shortName: "전체 게시물",
    icon: "✉️",
    description: "말린오이닷컴의 모든 게시물이 모이는 곳이에요.",
    position: [-9, 0, -4],
    color: "#f7a5a4",
    roof: "#ba4f5f",
  },
  {
    id: "write",
    name: "글쓰기 공방",
    shortName: "게시물 작성",
    icon: "✏️",
    description: "새 소식과 이야기를 마을에 남겨요.",
    position: [-10, 0, 6],
    color: "#87cdeb",
    roof: "#3f77a5",
  },
  {
    id: "store",
    name: "오이상점",
    shortName: "상점",
    icon: "🛍️",
    description: "캐릭터와 스킨, 효과를 구경하고 장착해요.",
    position: [9, 0, -5],
    color: "#f3c968",
    roof: "#ef8557",
  },
  {
    id: "calendar",
    name: "달력 정원",
    shortName: "캘린더",
    icon: "📅",
    description: "공부·일·행사 일정을 정리하는 조용한 정원이에요.",
    position: [10, 0, 6],
    color: "#b7a1dc",
    roof: "#6e5aa1",
  },
  {
    id: "host-house",
    name: "말오닷 주인장의 집",
    shortName: "나의 집",
    icon: "🥒",
    description: "내 캐릭터가 쉬고, 앞으로 직접 꾸밀 수 있는 공간이에요.",
    position: [14, 0, 12],
    color: "#b9dc76",
    roof: "#5f9648",
  },
];

export const samplePosts = [
  {
    category: "마을소식",
    title: "말오닷특별시 초안이 열렸어요!",
    author: "말오닷 주인장",
    meta: "방금 · 💚 18",
  },
  {
    category: "자유",
    title: "다들 어느 동네에 집을 짓고 싶나요?",
    author: "아보카도씨",
    meta: "12분 전 · 💬 7",
  },
  {
    category: "공부",
    title: "오늘도 2시간 집중 완료",
    author: "에그포테이토",
    meta: "35분 전 · 🌱 12",
  },
  {
    category: "일상",
    title: "광장 분수 옆에서 단체 사진 찍어요",
    author: "토마토아저씨",
    meta: "1시간 전 · 📷 5",
  },
];

export const calendarEvents = [
  { day: "08", color: "#f08b76", title: "주말 오이 장터", time: "오후 2:00" },
  { day: "12", color: "#688bd0", title: "마을 서비스 회의", time: "오후 7:30" },
  { day: "15", color: "#8eb853", title: "여름 오이 축제", time: "하루 종일" },
];

export const shopItems = [
  { id: "heart", icon: "💚", name: "오이 하트 효과", price: 280, owned: true },
  { id: "straw-hat", icon: "👒", name: "볕 좋은 밀짚모자", price: 160, owned: false },
  { id: "sprout", icon: "🌱", name: "새싹 발자국", price: 220, owned: false },
];

export const skins = [
  {
    id: "owner-kind",
    name: "당신의 친절한 오이",
    src: "/skins/spioi.png",
    characterCode: "char-cucumber",
    characterName: "기본오이",
  },
  { id: "cucumberboy", name: "오이소년", src: "/characters/cucumberboy.png" },
  { id: "cucumber", name: "오이쿵", src: "/characters/cucumber.png" },
  { id: "brocolli", name: "브로콜리", src: "/characters/brocolli.png" },
  { id: "tomato", name: "토마토", src: "/characters/tomato.png" },
];

export const villagers = [
  {
    name: "아보카도씨",
    src: "/characters/fat-avocado.png",
    position: [-2.8, 0, -0.5] as [number, number, number],
    online: true,
    message: "광장 바람이 좋다!",
  },
  {
    name: "토마토아저씨",
    src: "/characters/tomato.png",
    position: [3.4, 0, 1.4] as [number, number, number],
    online: true,
    message: "상점에 새 물건이 왔대.",
  },
];

export const sleepingResidents = [
  {
    name: "에그포테이토",
    src: "/characters/eggpotato.png",
    position: [14, 0, -1] as [number, number, number],
    houseColor: "#e9c890",
    roofColor: "#8d6b53",
  },
  {
    name: "테토당근",
    src: "/characters/teto-carrot.png",
    position: [15, 0, 5] as [number, number, number],
    houseColor: "#f2b680",
    roofColor: "#cf7253",
  },
  {
    name: "구운계란",
    src: "/characters/grilled-egg.png",
    position: [9, 0, 12] as [number, number, number],
    houseColor: "#e8c0a0",
    roofColor: "#9f6c55",
  },
];

export const trees: Array<{
  position: [number, number, number];
  scale: number;
  tint?: string;
}> = [
  { position: [-18, 0, -12], scale: 1.1 },
  { position: [-13, 0, -12], scale: 0.9 },
  { position: [-6, 0, -14], scale: 1.15 },
  { position: [7, 0, -14], scale: 1.05 },
  { position: [15, 0, -12], scale: 0.95 },
  { position: [19, 0, -6], scale: 1.15 },
  { position: [-19, 0, 2], scale: 0.95 },
  { position: [-17, 0, 11], scale: 1.2 },
  { position: [-11, 0, 14], scale: 0.9 },
  { position: [-3, 0, 15], scale: 1.05 },
  { position: [3, 0, 17], scale: 1.15 },
  { position: [19, 0, 14], scale: 1 },
];
