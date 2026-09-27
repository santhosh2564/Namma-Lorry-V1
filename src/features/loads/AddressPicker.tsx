/**
 * Pickup / drop picker for C3 (doc 12 C3).
 *
 * Two ways to set an end, both writing the same `{ address, point, radiusM }`:
 * pick an autosuggest result, or tap the map (C3's "draggable pin" — see the
 * note in the screen about why it is a tap rather than a drag).
 *
 * A Mappls suggestion usually arrives **without coordinates** — the REST
 * autosuggest response marks `latitude`/`longitude` as restricted. So a chosen
 * suggestion is geocoded before it becomes a pin; if that fails the picker
 * leaves the address but no point, and the schema refuses to submit a load
 * whose end was never located rather than storing a geofence at (0, 0).
 *
 * The radius control is a stepper plus presets rather than a drag slider: the
 * console is a web screen, and a drag slider would mean a native slider module
 * in a package that has to build for Android and iOS as well. The stepper
 * covers the same 100–2,000 m range in 50 m steps.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { LatLng } from "@/components/map/types";
import { Icon } from "@/components/ui/Icon";
import { TextField } from "@/components/ui/TextField";
import {
  DEFAULT_RADIUS_M,
  MAX_RADIUS_M,
  MIN_RADIUS_M,
  RADIUS_STEP_M,
  clampRadius,
} from "@/features/loads/schemas";
import { MapplsError, autosuggest, geocode, type MapSuggestion } from "@/lib/mappls";
import { borderWidth, colors, fonts, fontSize, radii, spacing, touch } from "@/theme/tokens";

export type EndpointValue = {
  address: string;
  /** Null until the end has actually been located. */
  point: LatLng | null;
  radiusM: number;
};

export const emptyEndpoint = (): EndpointValue => ({
  address: "",
  point: null,
  radiusM: DEFAULT_RADIUS_M,
});

const PRESETS = [100, 250, 500, 1000, 2000] as const;

/** Autosuggest waits for a pause in typing; Mappls bills and rate-limits calls. */
const SEARCH_DEBOUNCE_MS = 350;
/** Mappls rejects a query over 45 characters. */
const MAX_QUERY_CHARS = 45;

export type AddressPickerProps = {
  value: EndpointValue;
  onChange: (next: EndpointValue) => void;
  label: string;
  /** Makes this the end that a map tap moves. */
  active: boolean;
  onActivate: () => void;
  /** Biases the search near the other end, which is what a dispatcher expects. */
  bias?: LatLng;
  errorText?: string;
  testIDPrefix: string;
};

export function AddressPicker({
  value,
  onChange,
  label,
  active,
  onActivate,
  bias,
  errorText,
  testIDPrefix,
}: AddressPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value.address);
  const [suggestions, setSuggestions] = useState<MapSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  // Guards against a slow response overwriting a newer one, and against
  // setting state after the picker has gone away.
  const requestId = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term === "") {
      // Clearing the field is handled at the call site (see onChangeText), so
      // this effect only has to do the debounced work. Returning without
      // touching state keeps a keystroke from cascading a render.
      return;
    }

    const id = requestId.current + 1;
    requestId.current = id;

    const timer = setTimeout(() => {
      setSearching(true);
      void (async () => {
        try {
          const results = await autosuggest(term.slice(0, MAX_QUERY_CHARS), bias);
          if (!mounted.current || requestId.current !== id) {
            return;
          }
          setSuggestions(results);
          setSearchError(null);
        } catch (error) {
          if (!mounted.current || requestId.current !== id) {
            return;
          }
          setSuggestions([]);
          setSearchError(
            error instanceof MapplsError ? t(error.messageKey) : t("mappls.unknownError"),
          );
        } finally {
          if (mounted.current && requestId.current === id) {
            setSearching(false);
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, bias, t]);

  const choose = async (suggestion: MapSuggestion) => {
    const address = suggestion.label || suggestion.address;
    setQuery(address);
    setSuggestions([]);
    setListOpen(false);
    onActivate();

    // A restricted geometry means the pin has to come from a geocode.
    if (suggestion.lat !== null && suggestion.lng !== null) {
      onChange({
        address,
        point: { lat: suggestion.lat, lng: suggestion.lng },
        radiusM: value.radiusM,
      });
      return;
    }

    try {
      const result = await geocode(address);
      onChange({
        address,
        point: { lat: result.lat, lng: result.lng },
        radiusM: value.radiusM,
      });
    } catch {
      // The address is kept so the admin can fix it, but there is no point:
      // an unlocated end must not be submittable.
      onChange({ address, point: null, radiusM: value.radiusM });
    }
  };

  const setRadius = (metres: number) => {
    onChange({ ...value, radiusM: clampRadius(metres) });
  };

  const showList = listOpen && (suggestions.length > 0 || searching || searchError !== null);

  return (
    <View style={styles.group} testID={`${testIDPrefix}-picker`}>
      <TextField
        errorText={errorText}
        helperText={t("console.loads.new.addressHint")}
        icon="search"
        label={label}
        onChangeText={(text) => {
          setQuery(text);
          setListOpen(true);
          onActivate();
          if (text.trim() === "") {
            // Clearing the field is the one place the suggestion list is reset;
            // the search effect deliberately does not setState synchronously.
            setSuggestions([]);
            setSearchError(null);
            setSearching(false);
          }
          // Editing the text invalidates the resolved point until a suggestion
          // is chosen again, otherwise the pin would keep pointing at the old
          // address while the field showed a new one.
          if (text !== value.address) {
            onChange({ ...value, address: text, point: null });
          }
        }}
        onFocus={() => {
          setListOpen(true);
          onActivate();
        }}
        placeholder={t("console.loads.new.addressPlaceholder")}
        testID={`${testIDPrefix}-address`}
        value={query}
      />

      {searchError !== null ? (
        <Text style={styles.error} testID={`${testIDPrefix}-search-error`}>
          {searchError}
        </Text>
      ) : null}

      {showList ? (
        <View style={styles.dropdown} testID={`${testIDPrefix}-suggestions`}>
          {searching && suggestions.length === 0 ? (
            <Text style={styles.dropdownHint}>{t("console.loads.new.searching")}</Text>
          ) : null}
          {suggestions.map((suggestion) => (
            <Pressable
              key={`${suggestion.label}-${suggestion.eLoc ?? suggestion.address}`}
              accessibilityRole="button"
              onPress={() => void choose(suggestion)}
              style={({ pressed }) => [styles.option, pressed ? styles.optionPressed : null]}
              testID={`${testIDPrefix}-option`}
            >
              <Icon name="location_on" size={18} color={colors.textSecondary} />
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{suggestion.label}</Text>
                {suggestion.address !== "" && suggestion.address !== suggestion.label ? (
                  <Text style={styles.optionAddress}>{suggestion.address}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
          {!searching && suggestions.length === 0 && searchError === null ? (
            <Text style={styles.dropdownHint}>{t("console.loads.new.noResults")}</Text>
          ) : null}
        </View>
      ) : null}

      <RadiusControl value={value.radiusM} onChange={setRadius} testIDPrefix={testIDPrefix} />
    </View>
  );
}

/** 100–2,000 m in 50 m steps, with the doc-12 presets one tap away. */
function RadiusControl({
  value,
  onChange,
  testIDPrefix,
}: {
  value: number;
  onChange: (metres: number) => void;
  testIDPrefix: string;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.radius} testID={`${testIDPrefix}-radius`}>
      <View style={styles.radiusHeader}>
        <Text style={styles.radiusLabel}>{t("console.loads.new.radius")}</Text>
        <Text style={styles.radiusValue} testID={`${testIDPrefix}-radius-value`}>
          {t("console.loads.new.radiusValue", { metres: value })}
        </Text>
      </View>

      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel={t("console.loads.new.radius")}
          accessibilityRole="button"
          disabled={value <= MIN_RADIUS_M}
          onPress={() => onChange(value - RADIUS_STEP_M)}
          style={[styles.stepperButton, value <= MIN_RADIUS_M ? styles.stepperOff : null]}
          testID={`${testIDPrefix}-radius-down`}
        >
          <Icon
            name="remove"
            size={20}
            color={value <= MIN_RADIUS_M ? colors.textDisabled : colors.text}
          />
        </Pressable>

        <View style={styles.stepperTrack}>
          {PRESETS.map((preset) => {
            const selected = preset === value;
            return (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onChange(preset)}
                style={[styles.preset, selected ? styles.presetSelected : null]}
                testID={`${testIDPrefix}-radius-${preset}`}
              >
                <Text style={[styles.presetText, selected ? styles.presetTextSelected : null]}>
                  {t("console.loads.new.radiusValue", { metres: preset })}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityLabel={t("console.loads.new.radius")}
          accessibilityRole="button"
          disabled={value >= MAX_RADIUS_M}
          onPress={() => onChange(value + RADIUS_STEP_M)}
          style={[styles.stepperButton, value >= MAX_RADIUS_M ? styles.stepperOff : null]}
          testID={`${testIDPrefix}-radius-up`}
        >
          <Icon
            name="add"
            size={20}
            color={value >= MAX_RADIUS_M ? colors.textDisabled : colors.text}
          />
        </Pressable>
      </View>

      <Text style={styles.radiusHint}>{t("console.loads.new.radiusHint")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  dropdown: {
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: touch.min,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borderWidth.hairline,
    borderBottomColor: colors.border,
  },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  optionAddress: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  dropdownHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    padding: spacing.md,
  },
  error: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.rejected },
  radius: { gap: spacing.xs },
  radiusHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  radiusLabel: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  radiusValue: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.body,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepperButton: {
    width: touch.min,
    height: touch.min,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepperOff: { backgroundColor: colors.surfaceAlt },
  stepperTrack: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.xs,
  },
  preset: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.chip,
    borderWidth: borderWidth.hairline,
    borderColor: colors.border,
  },
  presetSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  presetTextSelected: { color: colors.onPrimary },
  radiusHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});
