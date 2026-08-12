/**
 * Category Visual Resolution
 *
 * Resolves the icon + colour used to render a transaction's category.
 *
 * The stored `category.icon` / `category.color` always win: they are what the user
 * sees when editing the category, and they are the only values that survive a rename
 * into any language. The name-based ladder below is a FALLBACK only, kept so that
 * legacy installs whose categories carry no icon/colour still render as before.
 *
 * Never guess from the name when the category has stored values - a user who renames
 * "Transport" to "Deplacements" (or to anything in a language the app does not ship)
 * must keep their icon and colour.
 */

import { Ionicons } from '@expo/vector-icons';

export type IoniconName = keyof typeof Ionicons.glyphMap;

/** Shape needed to resolve a visual - a subset of the Category entity. */
export interface CategoryVisualSource {
    readonly name: string;
    readonly icon?: string;
    readonly color?: string;
}

export interface CategoryVisual {
    readonly icon: IoniconName;
    readonly color: string;
}

export const DEFAULT_CATEGORY_ICON: IoniconName = 'card-outline';

/**
 * Legacy fallback: guess an icon from the category name.
 * Only reached when the category has no stored icon.
 */
function legacyIconFromName(categoryName: string): IoniconName | undefined {
    const lowerName = categoryName.toLowerCase();
    if (lowerName.includes('food') || lowerName.includes('dining')) return 'restaurant-outline';
    if (lowerName.includes('shopping')) return 'cart-outline';
    if (lowerName.includes('transport')) return 'car-outline';
    if (lowerName.includes('entertainment')) return 'film-outline';
    if (lowerName.includes('utilities')) return 'flash-outline';
    if (lowerName.includes('salary') || lowerName.includes('income')) return 'cash-outline';
    if (lowerName.includes('health')) return 'medical-outline';
    if (lowerName.includes('education')) return 'school-outline';
    return undefined;
}

/**
 * Legacy fallback: guess a colour from the category name.
 * Only reached when the category has no stored colour.
 */
function legacyColorFromName(categoryName: string): string | undefined {
    const lowerName = categoryName.toLowerCase();
    if (lowerName.includes('shopping')) return '#8B5CF6';
    if (lowerName.includes('food') || lowerName.includes('dining')) return '#F59E0B';
    if (lowerName.includes('transport')) return '#3B82F6';
    if (lowerName.includes('entertainment')) return '#EC4899';
    if (lowerName.includes('utilities')) return '#10B981';
    if (lowerName.includes('salary') || lowerName.includes('income')) return '#4ade80';
    if (lowerName.includes('health')) return '#14B8A6';
    if (lowerName.includes('education')) return '#8B5CF6';
    return undefined;
}

/**
 * Transaction rows use the outline weight. Categories may store a filled glyph
 * (the seed does: `restaurant`, `car`, `cash`), so prefer its outline variant -
 * but only when that variant actually exists in the glyph map. Some glyphs have
 * no `-outline` sibling (every `logo-*`, for instance).
 */
function toOutline(icon: string): IoniconName | undefined {
    if (icon in Ionicons.glyphMap) {
        const outline = `${icon}-outline`;
        if (outline in Ionicons.glyphMap) return outline as IoniconName;
        return icon as IoniconName;
    }
    if (`${icon}-outline` in Ionicons.glyphMap) return `${icon}-outline` as IoniconName;
    return undefined;
}

/**
 * Resolve the icon + colour for a category.
 *
 * @param category - the stored category, or undefined when it cannot be resolved
 * @param fallbackColor - theme colour used when nothing else applies (colors.accent)
 */
export function resolveCategoryVisual(
    category: CategoryVisualSource | undefined,
    fallbackColor: string,
): CategoryVisual {
    if (!category) {
        return { icon: DEFAULT_CATEGORY_ICON, color: fallbackColor };
    }

    const storedIcon = category.icon ? toOutline(category.icon) : undefined;
    const icon = storedIcon ?? legacyIconFromName(category.name) ?? DEFAULT_CATEGORY_ICON;
    const color = category.color ?? legacyColorFromName(category.name) ?? fallbackColor;

    return { icon, color };
}

// ─── Transfers ────────────────────────────────────────────────────────

/**
 * The two legs of a transfer carry pseudo category ids: no Category row exists
 * for them, so they never resolve through the ladder above and every call site
 * used to invent its own treatment. They are handled here instead, once.
 */
const TRANSFER_CATEGORY_IDS = ['transfer-in', 'transfer-out'] as const;

/** The one glyph that means "transfer" anywhere in the app. */
export const TRANSFER_ICON: IoniconName = 'swap-horizontal-outline';

/** True when the category id is one of the transfer pseudo-ids. */
export function isTransferCategoryId(categoryId: string): boolean {
    return (TRANSFER_CATEGORY_IDS as readonly string[]).includes(categoryId);
}

/** Shape needed to look a category up by id - a subset of the Category entity. */
export interface IdentifiedCategoryVisualSource extends CategoryVisualSource {
    readonly id: string;
}

/**
 * Resolve the icon + colour for a whole transaction, transfers included.
 *
 * Prefer this over resolveCategoryVisual at any site that renders a transaction:
 * it is what keeps the list rows and the detail screen showing one transfer
 * visual instead of three.
 *
 * @param transaction - the transaction being rendered
 * @param categories - the loaded categories, searched by id
 * @param accentColor - theme colour for transfers and for the fallback (colors.accent)
 */
export function resolveTransactionVisual(
    transaction: { readonly type: string; readonly categoryId: string },
    categories: readonly IdentifiedCategoryVisualSource[],
    accentColor: string,
): CategoryVisual {
    if (transaction.type === 'transfer' || isTransferCategoryId(transaction.categoryId)) {
        return { icon: TRANSFER_ICON, color: accentColor };
    }

    return resolveCategoryVisual(
        categories.find((category) => category.id === transaction.categoryId),
        accentColor,
    );
}
