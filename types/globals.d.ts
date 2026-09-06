// Ambient declarations so tsc --checkJs can see the symbols that lib.js
// exposes to content.js via the shared content-script isolated world.
// These mirror module.exports from lib.js. Update both together.

type Tier = 'home' | 'nearby' | 'other' | 'intl';
type ChipColor = { bg: string; fg: string };
type ShippingChip = ChipColor & { text: string };
type SellerInfo = {
  addressCity?: string;
  addressTerritory?: string;
  addressCountryCode?: string;
  location?: string;
};

declare const STATES: ReadonlyArray<readonly [string, string]>;
declare const STATE_NAMES: Record<string, string>;
declare const STATE_CODES: Set<string>;
declare const DEFAULT_NEARBY: ReadonlyArray<string>;
declare const VALID_TIERS: Set<string>;
declare const FREE_SHIP_THRESHOLD: number;

declare const TCG_CONDITIONS: ReadonlyArray<string>;
declare function skuLookupKey(condition: string | null | undefined, variant: string | null | undefined): string;
declare function capConditionMarkets(markets: Map<string, number>): Map<string, number>;
declare function parsePrice(text: string | null | undefined): number | null;
declare function parseShippingCost(text: string | null | undefined): number | null;
declare function parseUsdAmount(text: string | null | undefined): number | null;
declare function parseQuantityValue(value: string | number | null | undefined): number;
type CartVerdict = {
  marketValue: number;
  itemsTotal: number;
  shipping: number;
  tax: number;
  allIn: number;
  delta: number;
  pct: number;
  unitCount: number;
  unresolvedCount: number;
  coverageOk: boolean;
};
declare function computeCartVerdict(opts: {
  items: Array<{ price: number; qty?: number; market?: number | null }>;
  itemsTotal?: number | null;
  shipping?: number | null;
  tax?: number | null;
}): CartVerdict | null;
declare function parseConditionAndVariant(text: string | null | undefined): {
  condition: string | null;
  variant: string | null;
};
declare function getUrlConditions(url: string | URL | null | undefined): string[];
declare function listingMatchesHeadlineCondition(
  listingCondition: string | null | undefined,
  headlineConditions: string[] | null | undefined
): boolean;
declare function extractSellerKey(href: string | null | undefined): string | null;
declare function classifyState(stateCode: string, homeState: string, nearbyStates?: Set<string>): Tier;
declare function stateCodeFromInfo(info: SellerInfo | null | undefined): string;
declare function formatLocation(info: SellerInfo | null | undefined): string;
declare function chipColorForPct(pct: number): ChipColor;
declare function chipForShipping(cost: number): ShippingChip;
declare function formatAbsDiff(diff: number): string;
declare function formatPctDiff(pct: number): string;
declare function tierLabel(tier: Tier, homeState: string, stateNames?: Record<string, string>): string;
declare function isOurNode(n: Node | null | undefined): boolean;

type DegradationTracker = {
  mark: (key: string, message: string) => void;
  clear: (key: string) => void;
  entries: Map<string, string>;
};
declare function createDegradationTracker(opts?: {
  debounceMs?: number;
  onChange?: () => void;
  log?: (msg: string) => void;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}): DegradationTracker;

declare function createCoalescedRunner(fn: () => Promise<void> | void): () => Promise<void>;

declare function cacheUntilNull<V>(
  cache: Map<any, Promise<V | null>>,
  key: any,
  fetcher: () => Promise<V | null> | V | null
): Promise<V | null>;

type OosBannerDescription = {
  text: string;
  button: string;
  nextHide: boolean;
};
declare function describeOosBanner(oosCount: number, hideOOS: boolean): OosBannerDescription | null;

// storage.js — chrome.storage.local helpers shared by content.js and the options page.

type StorageKeyMap = {
  homeState: string;
  nearbyStates: string;
  activeFilter: string;
  hideBreakdown: string;
  hideRecommendations: string;
  hideFooter: string;
  forceNearMint: string;
  hideOOS: string;
  migrated: string;
};

declare const STORAGE_KEYS: StorageKeyMap;
declare const ALL_STORAGE_KEYS: ReadonlyArray<string>;

declare function loadAllSettings(): Promise<Record<string, unknown>>;
declare function saveSetting(key: string, value: unknown): Promise<void>;
declare function removeSetting(key: string): Promise<void>;
declare function migrateFromLocalStorageIfNeeded(): Promise<void>;
