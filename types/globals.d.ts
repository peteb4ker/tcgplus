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

declare function parsePrice(text: string | null | undefined): number | null;
declare function parseShippingCost(text: string | null | undefined): number | null;
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
