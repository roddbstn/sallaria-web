import type { Account, Category, Menu } from './types'

export const ACCOUNTS: Account[] = [
  { code: 'A001', accountNumber: 1, name: '북구청 공원녹지과', type: '구청 과', org: '북구청', balance: 223400, pin: '1234' },
  { code: 'A002', accountNumber: 2, name: '북구청 건설과', type: '구청 과', org: '북구청', balance: 415000, pin: '2345' },
  { code: 'A003', accountNumber: 3, name: 'KT 침산지점', type: '기업', org: 'KT', balance: 87000, pin: '3456' },
  { code: 'A004', accountNumber: 4, name: '북부경찰서 교통과', type: '기타', org: '북부경찰서', balance: 12500, pin: '4567' },
  { code: 'A005', accountNumber: 5, name: '김다현', type: '개인', org: null, balance: 45000, pin: '5678' },
]

export const CATEGORIES: Category[] = [
  { id: 'popular', name: '인기 메뉴' },
  { id: 'all', name: '전체' },
  { id: 'poke', name: '포케' },
  { id: 'salad', name: '샐러드' },
  { id: 'wrap', name: '랩·샌드위치' },
  { id: 'lunch', name: '도시락' },
  { id: 'drink', name: '음료' },
]

export const MENUS: Menu[] = [
  {
    code: 'M001', cat: 'poke', name: '클래식 포케',
    desc: '연어, 아보카도, 옥수수가 들어간 기본 포케볼',
    price: 11500, emoji: '🥗', popular: true,
    options: [
      { group: '베이스', required: true, multi: false, items: [
        { id: 'b1', name: '현미밥', plus: 0 },
        { id: 'b2', name: '메밀면', plus: 0 },
        { id: 'b3', name: '샐러드 베이스', plus: 0 },
      ]},
      { group: '가격', required: true, multi: false, items: [
        { id: 's1', name: '100g', plus: 0 },
        { id: 's2', name: '200g', plus: 3000 },
      ]},
      { group: '드레싱 (기본)', required: true, multi: false, items: [
        { id: 'd1', name: '오리엔탈', plus: 0 },
        { id: 'd2', name: '발사믹', plus: 0 },
        { id: 'd3', name: '시저', plus: 0 },
      ]},
      { group: '토핑 추가', required: false, multi: true, items: [
        { id: 't1', name: '아보카도 추가', plus: 1500 },
        { id: 't2', name: '새우 추가', plus: 2000 },
        { id: 't3', name: '연어 추가', plus: 2500 },
        { id: 't4', name: '베이컨', plus: 1000 },
      ]},
    ],
  },
  {
    code: 'M002', cat: 'poke', name: '매콤 치킨 포케',
    desc: '매콤한 양념에 버무린 닭다리살 포케',
    price: 12000, emoji: '🍱', popular: true,
    options: [
      { group: '베이스', required: true, multi: false, items: [
        { id: 'b1', name: '현미밥', plus: 0 },
        { id: 'b2', name: '메밀면', plus: 0 },
      ]},
      { group: '가격', required: true, multi: false, items: [
        { id: 's1', name: '100g', plus: 0 },
        { id: 's2', name: '200g', plus: 3000 },
      ]},
      { group: '토핑 추가', required: false, multi: true, items: [
        { id: 't1', name: '아보카도 추가', plus: 1500 },
        { id: 't4', name: '베이컨', plus: 1000 },
      ]},
    ],
  },
  {
    code: 'M003', cat: 'salad', name: '시저 샐러드',
    desc: '로메인, 파마산, 크루통과 시저 드레싱',
    price: 9900, emoji: '🥬', popular: true,
    options: [
      { group: '드레싱', required: true, multi: false, items: [
        { id: 'd1', name: '시저', plus: 0 },
        { id: 'd2', name: '오리엔탈', plus: 0 },
        { id: 'd3', name: '발사믹', plus: 0 },
      ]},
      { group: '추가 토핑', required: false, multi: true, items: [
        { id: 't1', name: '닭가슴살 추가', plus: 2000 },
        { id: 't2', name: '아보카도 추가', plus: 1500 },
      ]},
    ],
  },
  {
    code: 'M004', cat: 'salad', name: '그릭 샐러드',
    desc: '페타치즈, 올리브, 토마토의 지중해식 샐러드',
    price: 10500, emoji: '🥒', popular: false,
    options: [
      { group: '추가 토핑', required: false, multi: true, items: [
        { id: 't1', name: '닭가슴살 추가', plus: 2000 },
      ]},
    ],
  },
  {
    code: 'M005', cat: 'wrap', name: '베이컨 에그 랩',
    desc: '바삭한 베이컨과 스크램블 에그',
    price: 8400, emoji: '🌯', popular: true,
    options: [
      { group: '음료 추가', required: false, multi: false, items: [
        { id: 'd1', name: '아메리카노 추가', plus: 2000 },
        { id: 'd2', name: '제로콜라 추가', plus: 1500 },
      ]},
    ],
  },
  {
    code: 'M006', cat: 'wrap', name: '햄 치즈 샌드위치',
    desc: '클래식 햄과 체다 치즈',
    price: 7900, emoji: '🥪', popular: false,
    options: [],
  },
  {
    code: 'M007', cat: 'lunch', name: '닭갈비 도시락',
    desc: '매콤한 닭갈비와 잡곡밥',
    price: 11000, emoji: '🍱', popular: true,
    options: [
      { group: '매운맛', required: true, multi: false, items: [
        { id: 's1', name: '순한맛', plus: 0 },
        { id: 's2', name: '보통', plus: 0 },
        { id: 's3', name: '매운맛', plus: 0 },
      ]},
    ],
  },
  {
    code: 'M008', cat: 'lunch', name: '제육 도시락',
    desc: '잘 익은 제육볶음과 잡곡밥',
    price: 10500, emoji: '🍚', popular: false,
    options: [],
  },
  {
    code: 'M009', cat: 'drink', name: '아메리카노',
    desc: '깔끔한 에스프레소 베이스',
    price: 2500, emoji: '☕', popular: false,
    options: [
      { group: '온도', required: true, multi: false, items: [
        { id: 't1', name: '아이스', plus: 0 },
        { id: 't2', name: '핫', plus: 0 },
      ]},
    ],
  },
  {
    code: 'M010', cat: 'drink', name: '제로콜라',
    desc: '시원하게 제공',
    price: 2000, emoji: '🥤', popular: false,
    options: [],
  },
]
