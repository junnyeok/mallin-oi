import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { collectSharedPersonalReadonlyDetails } from '../assets/js/modules/calendar-shared-personal-readonly-collector.js';
import {
  createCalendarScheduleListContent,
  formatCalendarScheduleListTime,
  getEditableCalendarScheduleSource,
  isReadonlySharedPersonalDetail,
  normalizeSharedPersonalDetail,
  openSharedPersonalReadonlyDetail,
  renderSharedPersonalReadonlyDetail,
} from '../assets/js/modules/calendar-shared-personal-readonly.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

function makeEvent(overrides = {}) {
  return {
    id: 'backup-row-1',
    group_id: 'group-a',
    user_id: 'other-user',
    calendar_type: 'study',
    source_event_id: 'source-1',
    event_date: '2026-08-02',
    event_type: 'study',
    title: '영어 공부',
    memo: '단어 20개',
    color: '#e7f6ff',
    payload: {
      categoryName: '공부',
      todoTime: '21:00:00',
      todoEndDate: '2026-08-02',
      todoEndTime: '22:00:00',
      isDone: false,
    },
    ...overrides,
  };
}

function makeGroupState(events) {
  return {
    selectedGroup: { id: 'group-a' },
    eventsByDate: {
      '2026-08-02': [
        { userId: 'me', name: '나', events: [makeEvent({ user_id: 'me' })] },
        { userId: 'other-user', name: '긴 닉네임 이용자', events },
      ],
    },
  };
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  add(...names) {
    const tokens = new Set(this.element.className.split(/\s+/).filter(Boolean));
    names.forEach((name) => tokens.add(name));
    this.element.className = [...tokens].join(' ');
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.style = { setProperty: (key, value) => this.style[key] = value };
    this.classList = new FakeClassList(this);
    this.className = '';
    this.textContent = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }
}

function findByClass(root, className) {
  if (root.className.split(/\s+/).includes(className)) return root;
  for (const child of root.children) {
    const match = findByClass(child, className);
    if (match) return match;
  }
  return null;
}

function getVisibleText(root) {
  return [root.textContent, ...root.children.map(getVisibleText)].join(' ');
}

test('공통 수집기는 현재 그룹·날짜·타입의 다른 이용자 개인 일정만 중복 없이 수집한다', () => {
  const valid = makeEvent();
  const details = collectSharedPersonalReadonlyDetails({
    groupState: makeGroupState([
      valid,
      { ...valid, id: 'duplicate-row' },
      makeEvent({ id: 'wrong-date', source_event_id: 'source-2', event_date: '2026-08-03' }),
      makeEvent({ id: 'wrong-group', source_event_id: 'source-3', group_id: 'group-b' }),
      makeEvent({ id: 'wrong-type', source_event_id: 'source-4', calendar_type: 'work' }),
      makeEvent({
        id: 'shared-copy',
        source_event_id: 'source-5',
        payload: { is_shared_copy: true },
      }),
    ]),
    dateKey: '2026-08-02',
    calendarType: 'study',
    currentUserId: 'me',
  });

  assert.equal(details.length, 1);
  assert.equal(details[0].sourceEventId, 'source-1');
  assert.equal(details[0].ownerUserId, 'other-user');
  assert.equal(details[0].ownerName, '긴 닉네임 이용자');
  assert.equal(details[0].calendarType, 'study');
  assert.equal(details[0].categoryName, '공부');
  assert.equal(details[0].memo, '단어 20개');
  assert.equal(details[0].eventTime, '오후 9:00');
  assert.equal(details[0].eventEndTime, '오후 10:00');
  assert.equal(details[0].timeLabel, '오후 9:00 ~ 오후 10:00');
});

test('공통 수집기는 그룹·사용자·타입 조건이 없거나 연동이 꺼지면 빈 목록을 반환한다', () => {
  const groupState = makeGroupState([makeEvent()]);
  assert.deepEqual(collectSharedPersonalReadonlyDetails({
    groupState: { ...groupState, selectedGroup: null },
    dateKey: '2026-08-02',
    calendarType: 'study',
    currentUserId: 'me',
  }), []);
  assert.deepEqual(collectSharedPersonalReadonlyDetails({
    groupState,
    dateKey: '2026-08-02',
    calendarType: 'unknown',
    currentUserId: 'me',
  }), []);
  assert.deepEqual(collectSharedPersonalReadonlyDetails({
    groupState,
    dateKey: '2026-08-02',
    calendarType: 'study',
    currentUserId: '',
  }), []);
});

test('event·study·work 정규화는 각 payload의 카테고리와 상세 시간 범위를 보존한다', () => {
  const cases = [
    ['event', { eventTime: '09:10', eventEndTime: '10:20' }, '오전 9:10 ~ 오전 10:20'],
    ['study', { todoTime: '13:00', todoEndDate: '2026-08-03', todoEndTime: '01:00' }, '오후 1:00 ~ 다음 날 오전 1:00'],
    ['work', { categoryStartTime: '22:00', categoryEndTime: '06:00', categoryEndsNextDay: true, workText: '야간 근무' }, '오후 10:00 ~ 오전 6:00 (익일)'],
  ];

  for (const [calendarType, payload, expectedTime] of cases) {
    const detail = normalizeSharedPersonalDetail(makeEvent({
      calendar_type: calendarType,
      payload: { categoryName: '카테고리', ...payload },
    }), {
      calendarType,
      currentUserId: 'me',
      ownerName: '',
      groupId: 'group-a',
    });

    assert.equal(detail.calendarType, calendarType);
    assert.equal(detail.categoryName, '카테고리');
    assert.equal(detail.timeLabel, expectedTime);
    assert.equal(detail.ownerName, '회원');
  }
});

test('공통 카드에는 카테고리와 같은 행에 닉네임·그룹원 일정 배지를 렌더링한다', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };

  try {
    const list = new FakeElement('ul');
    const detail = normalizeSharedPersonalDetail(makeEvent(), {
      calendarType: 'study',
      currentUserId: 'me',
      ownerName: '아주 긴 닉네임 이용자',
      groupId: 'group-a',
    });

    assert.equal(renderSharedPersonalReadonlyDetail({
      list,
      detail,
      itemClass: 'study-todo-item',
    }), true);

    const item = list.children[0];
    const meta = findByClass(item, 'calendar-schedule-list__meta');
    const category = findByClass(item, 'calendar-schedule-list__category');
    const source = findByClass(item, 'calendar-schedule-list__source');
    const owner = findByClass(item, 'calendar-schedule-list__owner');
    const label = findByClass(item, 'calendar-schedule-list__source-badge');
    const button = findByClass(item, 'calendar-shared-personal-detail__open');

    assert.equal(meta.children[0], category);
    assert.equal(meta.children[1], source);
    assert.equal(source.children[0], owner);
    assert.equal(source.children[1], label);
    assert.equal(owner.textContent, '아주 긴 닉네임 이용자');
    assert.equal(owner.title, '아주 긴 닉네임 이용자');
    assert.equal(label.textContent, '그룹원 일정');
    assert.equal(item.dataset.readonly, 'true');
    assert.equal(button.listeners.has('click'), true);
    assert.equal(findByClass(item, 'calendar-shared-personal-detail__chip').textContent, '공부');
    assert.equal(findByClass(item, 'calendar-shared-personal-detail__head'), null);
    assert.equal(getVisibleText(item).includes('오후 9:00 ~ 오후 10:00'), true);
    assert.equal(getVisibleText(item).includes('읽기 전용'), false);
    assert.equal(getVisibleText(item).includes('단어 20개'), true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('일정 출처는 그룹 활성 상태와 공유 소유 데이터를 기준으로 판정한다', () => {
  assert.equal(getEditableCalendarScheduleSource({
    todo: { id: 'mine' },
    category: { id: 'personal-category' },
    groupActive: true,
    selectedGroupId: 'group-a',
  }), 'own');
  assert.equal(getEditableCalendarScheduleSource({
    todo: { id: 'shared', sharedGroupId: 'group-a', isSharedCopy: true },
    category: { id: 'shared-category' },
    groupActive: true,
    selectedGroupId: 'group-a',
  }), 'group');
  assert.equal(getEditableCalendarScheduleSource({
    todo: { id: 'other-group', sharedGroupId: 'group-b', isSharedCopy: true },
    category: { id: 'shared-category' },
    groupActive: true,
    selectedGroupId: 'group-a',
  }), 'own');
  assert.equal(getEditableCalendarScheduleSource({
    todo: { id: 'mine' },
    groupActive: false,
    selectedGroupId: 'group-a',
  }), '');
});

test('공통 콘텐츠는 내 일정·우리 일정 배지를 활성 상태에서만 카테고리 우측에 표시한다', () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tagName) => new FakeElement(tagName) };

  try {
    for (const [source, expectedLabel] of [['own', '내 일정'], ['group', '우리 일정']]) {
      const body = createCalendarScheduleListContent({
        categoryName: '휴무',
        source,
        timeLabel: '시간 미지정',
        title: '당(또)',
      });
      const meta = findByClass(body, 'calendar-schedule-list__meta');
      assert.equal(meta.children[0].textContent, '휴무');
      assert.equal(meta.children[1].children[0].textContent, expectedLabel);
      assert.equal(getVisibleText(body).includes('시간 미지정 · 당(또)'), true);
    }

    const personalBody = createCalendarScheduleListContent({
      categoryName: '휴무',
      source: '',
      timeLabel: '시간 미지정',
      title: '개인 일정',
    });
    assert.equal(findByClass(personalBody, 'calendar-schedule-list__source'), null);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('공통 시간 포맷은 미지정·범위·종일·업무 익일을 구분한다', () => {
  assert.equal(formatCalendarScheduleListTime(), '시간 미지정');
  assert.equal(formatCalendarScheduleListTime({
    startTime: '18:00',
    endTime: '21:00',
  }), '오후 6:00 ~ 오후 9:00');
  assert.equal(formatCalendarScheduleListTime({ isAllDay: true }), '종일');
  assert.equal(formatCalendarScheduleListTime({
    calendarType: 'work',
    startTime: '18:00',
    endTime: '09:00',
    endsNextDay: true,
  }), '오후 6:00 ~ 오전 9:00 (익일)');
});

test('읽기 전용 상세는 readonly 모드와 표시 필드만 사용하고 편집 콜백을 받지 않는다', () => {
  const source = openSharedPersonalReadonlyDetail.toString();
  assert.match(source, /mode:\s*'readonly'/);
  for (const key of ['title', 'owner', 'category', 'date', 'time', 'memo']) {
    assert.match(source, new RegExp(`key: '${key}'`));
  }
  assert.doesNotMatch(source, /onSave|onDelete|input|select|textarea/);
  assert.equal(isReadonlySharedPersonalDetail({ readonly: true }, 'me'), true);
  assert.equal(isReadonlySharedPersonalDetail({ userId: 'other-user' }, 'me'), true);
  assert.equal(isReadonlySharedPersonalDetail({ userId: 'me' }, 'me'), false);
});

test('세 캘린더 목록은 공통 콘텐츠·출처 판정·읽기 전용 렌더러를 함께 사용한다', () => {
  for (const calendarType of ['event', 'study', 'work']) {
    const source = read(`assets/js/modules/${calendarType}-calendar.js`);
    assert.match(source, /collectSharedPersonalReadonlyDetails/);
    assert.match(source, /renderSharedPersonalReadonlyDetail/);
    assert.match(source, /createCalendarScheduleListContent/);
    assert.match(source, /getEditableCalendarScheduleSource/);
    assert.match(source, /isCalendarGroupActive\(state\.group\?\.state\)/);
    assert.match(source, /empty\.hidden = todos\.length > 0 \|\| readonlyDetails\.length > 0/);
    assert.match(source, /isReadonlySharedPersonalDetail\(target, state\.userId\)/);
  }
});

test('공통 CSS는 카테고리·닉네임·배지 한 행과 모바일 축약을 정의한다', () => {
  const css = read('assets/css/main/calendar-groups-main.css');
  assert.match(css, /\.calendar-schedule-list__meta\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s);
  assert.match(css, /\.calendar-schedule-list__owner\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.calendar-schedule-list__source-badge\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.calendar-shared-personal-detail__open\s*\{[^}]*width:\s*100%/s);
  assert.match(css, /\.calendar-shared-personal-detail__open:focus-visible/);
});

test('이전 공유 개인 일정 문구는 제품 자산과 fixture에 남아 있지 않다', () => {
  for (const relativePath of [
    'assets/js/modules/calendar-shared-personal-readonly.js',
    'assets/js/modules/event-calendar.js',
    'assets/js/modules/study-calendar.js',
    'assets/js/modules/work-calendar.js',
    'tests/fixtures/calendar-shared-personal-readonly-browser.html',
  ]) {
    assert.equal(read(relativePath).includes('공유된 개인일정'), false);
  }
});
