import { msg, regionName, compareLocaleText } from "./i18n.js";
import { LIFE_TABLE_OPTIONS } from "./lifetable.js";
import { UN_LOCATIONS } from "./un-life-tables.js";

/** Localized search records with World and SSA pinned before UN countries/areas. */
export function buildLifeTableOptions() {
  const pinned = LIFE_TABLE_OPTIONS.map(({ value, messageKey }) => ({
    value,
    label: msg(messageKey),
  }));
  const countries = UN_LOCATIONS.map((location) => {
    const localizedName = regionName(location.iso2, location.name);
    const label = msg("lifeTableCountry", localizedName);
    return {
      value: location.id,
      label,
      displayText: label,
      meta: location.iso3 || location.m49,
      searchText: [
        localizedName,
        location.name,
        location.iso2,
        location.iso3,
        location.locId,
        location.m49,
        "UN",
        "2023",
      ]
        .filter(Boolean)
        .join(" "),
      localizedName,
      officialName: location.name,
    };
  }).sort(
    (left, right) =>
      compareLocaleText(left.localizedName, right.localizedName) ||
      left.value.localeCompare(right.value),
  );
  return [...pinned, ...countries];
}
