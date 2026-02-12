export type StationType = 'HPC' | 'DC' | 'AC';

export type ConnectorStatus = 'available' | 'busy' | 'charging' | 'offline';

export type Station = {
  id: string;
  uuid: string;
  name: string;
  latitude: number;
  longitude: number;
  type: StationType;
  powerKw: number;
  distanceKm?: number;
  status: ConnectorStatus;
  isEfish?: boolean;
  is_public?: boolean;
  is_24h?: boolean;
  address?: string;
  socket_stats?: Record<string, { available: number; total: number }>;
  connectors?: Array<{
    id: string;
    powerKw: number;
    status: ConnectorStatus;
  }>;
};

export const stations: Station[] = [
  {
    id: 'metro-dudullu',
    uuid: 'uuid-1',
    name: 'Metro Market Dudullu',
    latitude: 41.0149,
    longitude: 29.1327,
    type: 'DC',
    powerKw: 60,
    distanceKm: 4,
    status: 'busy',
    isEfish: true,
    address: 'Dudullu OSB, Ümraniye',
    connectors: [
      { id: '1A', powerKw: 60, status: 'charging' },
      { id: '2A', powerKw: 60, status: 'charging' },
    ],
  },
  {
    id: 'umraniye-meydan',
    uuid: 'uuid-2',
    name: 'Meydan AVM Ümraniye',
    latitude: 41.0197,
    longitude: 29.1242,
    type: 'HPC',
    powerKw: 120,
    distanceKm: 6,
    status: 'available',
    isEfish: true,
    address: 'Meydan AVM Otoparkı, Ümraniye',
    connectors: [
      { id: 'A1', powerKw: 120, status: 'available' },
      { id: 'A2', powerKw: 120, status: 'available' },
    ],
  },
  {
    id: 'sanayi-sultanbeyli',
    uuid: 'uuid-3',
    name: 'Sultanbeyli Sanayi',
    latitude: 40.9705,
    longitude: 29.2682,
    type: 'DC',
    powerKw: 60,
    distanceKm: 12,
    status: 'available',
    isEfish: true,
    address: 'Sultanbeyli Sanayi Sitesi',
    connectors: [
      { id: '1', powerKw: 60, status: 'available' },
      { id: '2', powerKw: 60, status: 'busy' },
    ],
  },
  {
    id: 'atakoy-marina',
    uuid: 'uuid-4',
    name: 'Ataköy Marina',
    latitude: 40.9793,
    longitude: 28.8755,
    type: 'AC',
    powerKw: 22,
    distanceKm: 23,
    status: 'available',
    isEfish: true,
    address: 'Ataköy Marina Otoparkı',
    connectors: [
      { id: 'A', powerKw: 22, status: 'available' },
      { id: 'B', powerKw: 22, status: 'available' },
    ],
  },
  {
    id: 'kalamis-park',
    uuid: 'uuid-5',
    name: 'Kalamış Park',
    latitude: 40.9846,
    longitude: 29.0347,
    type: 'AC',
    powerKw: 22,
    distanceKm: 15,
    status: 'busy',
    isEfish: true,
    address: 'Kalamış Sahil, Kadıköy',
    connectors: [
      { id: 'C1', powerKw: 22, status: 'busy' },
      { id: 'C2', powerKw: 22, status: 'available' },
    ],
  },
  {
    id: 'kadikoy-pier',
    uuid: 'uuid-6',
    name: 'Kadıköy İskelesi',
    latitude: 40.9915,
    longitude: 29.0255,
    type: 'HPC',
    powerKw: 150,
    distanceKm: 14,
    status: 'available',
    isEfish: true,
    address: 'Kadıköy İskelesi Açık Otopark',
    connectors: [
      { id: 'Fast-1', powerKw: 150, status: 'available' },
      { id: 'Fast-2', powerKw: 150, status: 'available' },
    ],
  },
  {
    id: 'sile-road',
    uuid: 'uuid-7',
    name: 'Şile Yolu Dinlenme Tesisi',
    latitude: 41.0878,
    longitude: 29.2781,
    type: 'DC',
    powerKw: 90,
    distanceKm: 28,
    status: 'available',
    isEfish: true,
    address: 'Şile Yolu Üzeri, Çekmeköy',
    connectors: [
      { id: 'S1', powerKw: 90, status: 'available' },
      { id: 'S2', powerKw: 90, status: 'charging' },
    ],
  },
  {
    id: 'kozyatagi',
    uuid: 'uuid-8',
    name: 'Kozyatağı İş Merkezi',
    latitude: 40.9832,
    longitude: 29.1031,
    type: 'AC',
    powerKw: 11,
    distanceKm: 9,
    status: 'available',
    isEfish: true,
    address: 'Kozyatağı Ofis Bloğu Otopark',
    connectors: [
      { id: 'K1', powerKw: 11, status: 'available' },
      { id: 'K2', powerKw: 11, status: 'busy' },
    ],
  },
];

