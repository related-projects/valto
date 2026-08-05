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
