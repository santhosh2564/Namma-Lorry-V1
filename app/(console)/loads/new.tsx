import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppMap, type LatLng } from "@/components/map";
import { Banner, Button, Card, SectionHeader, TextField } from "@/components/ui";
import { AddressPicker, type EndpointValue } from "@/features/loads/AddressPicker";
import {
  DEFAULT_RADIUS_M,
  createLoadSchema,
  formatDuration,
  formatKm,
  type CreateLoadValues,
} from "@/features/loads/schemas";
import { useCreateLoad } from "@/features/loads/useLoads";
import { distance, reverse } from "@/lib/mappls";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/** The form holds an end that may not be located yet; the schema narrows it. */
type CreateLoadForm = {
  pickup: { address: string; point?: LatLng; radiusM: number };
  drop: { address: string; point?: LatLng; radiusM: number };
  material?: string;
  weightTonnes?: string;
  notes?: string;
};

type ActiveEnd = "pickup" | "drop";

/** Planned distance is re-checked at most this often while the pins move. */
const DISTANCE_DEBOUNCE_MS = 600;

/**
 * C3 Create Load (docs/12 C3, doc 04 §4 C3).
 *
 * The two ends are set by autosuggest or by tapping the map, and the map is
 * also how a pin is *refined*: doc 12 calls for a draggable pin, and the
 * shared `AppMap` contract (docs/03 §5) has no marker-drag event on either
 * platform, so a map tap moves whichever pin is selected. The two
 * `AddressPicker` rows act as the pin selector, and every tap after that
 * nudges the same pin — the same gesture, one step less. Making the contract
 * drag-capable is the M11 live-map milestone's job, not this screen's.
 *
 * Nothing here trusts the client for a distance: `planned_distance_m` is what
 * the Mappls proxy returned. If the proxy is unreachable the load is still
 * saved, with a null planned distance and a visible warning, because a
 * dispatcher must be able to create freight during a Mappls outage.
 */
export default function NewLoadScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const form = useForm<CreateLoadForm, unknown, CreateLoadValues>({
    resolver: zodResolver(createLoadSchema),
    defaultValues: {
      pickup: { address: "", radiusM: DEFAULT_RADIUS_M },
      drop: { address: "", radiusM: DEFAULT_RADIUS_M },
      material: "",
      weightTonnes: "",
      notes: "",
    },
  });

  const [activeEnd, setActiveEnd] = useState<ActiveEnd>("pickup");
  // `useWatch` rather than `form.watch`: watch() cannot be memoised, and the
  // React Compiler skips a component that uses it.
  const pickup = useWatch({ control: form.control, name: "pickup" });
  const drop = useWatch({ control: form.control, name: "drop" });
  const material = useWatch({ control: form.control, name: "material" });
  const weightTonnes = useWatch({ control: form.control, name: "weightTonnes" });
  const notes = useWatch({ control: form.control, name: "notes" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const createLoad = useCreateLoad();

  const pickupPoint = pickup.point ?? null;
  const dropPoint = drop.point ?? null;

  const { setValue, clearErrors } = form;

  // C3's "on save, fetch planned distance" is done live instead: the distance
  // is re-checked as the pins settle, so the number the admin saves is the one
  // they just saw, and the save itself is a single insert.
  //
  // The result is tagged with the pair of points it belongs to and the strip is
  // *derived* from that tag, rather than the effect pushing a state. Moving a
  // pin therefore shows "checking" until the new number lands, and moving a
  // pin back to where it was reuses the answer already fetched.
  const pointKey =
    pickupPoint !== null && dropPoint !== null
      ? `${pickupPoint.lat},${pickupPoint.lng}>${dropPoint.lat},${dropPoint.lng}`
      : null;
  const [distanceResult, setDistanceResult] = useState<{
    key: string;
    metres: number;
    durationS: number;
  } | null>(null);
  const [unavailableFor, setUnavailableFor] = useState<string | null>(null);

  const distanceRequest = useRef(0);
  useEffect(() => {
    if (pointKey === null || pickupPoint === null || dropPoint === null) {
      return;
    }

    const id = distanceRequest.current + 1;
    distanceRequest.current = id;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const result = await distance(pickupPoint, dropPoint);
          if (distanceRequest.current !== id) {
            return;
          }
          setDistanceResult({
            key: pointKey,
            metres: result.distanceM,
            durationS: result.durationS,
          });
          setUnavailableFor(null);
        } catch {
          if (distanceRequest.current !== id) {
            return;
          }
          setUnavailableFor(pointKey);
        }
      })();
    }, DISTANCE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [pointKey, pickupPoint, dropPoint]);

  const distanceState =
    pointKey === null
      ? ({ kind: "idle" } as const)
      : distanceResult?.key === pointKey
        ? ({
            kind: "ready",
            metres: distanceResult.metres,
            durationS: distanceResult.durationS,
          } as const)
        : unavailableFor === pointKey
          ? ({ kind: "unavailable" } as const)
          : ({ kind: "fetching" } as const);

  const setEndpoint = (end: ActiveEnd, next: EndpointValue) => {
    setValue(end, {
      address: next.address,
      point: next.point ?? undefined,
      radiusM: next.radiusM,
    });
    if (next.point !== null) {
      clearErrors(`${end}.point`);
    }
  };

  /**
   * A map tap moves the selected pin and names it.
   *
   * Reverse geocoding is best effort: if the proxy is down the pin still moves
   * and the admin keeps whatever address was already there, because refusing a
   * pin drop over a missing label would be worse than a stale one.
   */
  const onMapPress = (point: LatLng) => {
    const end = activeEnd;
    const current = end === "pickup" ? toEndpointValue(pickup) : toEndpointValue(drop);

    setEndpoint(end, { ...current, point });
    clearErrors(`${end}.point`);

    void (async () => {
      try {
        const result = await reverse(point);
        if (result.formattedAddress !== "") {
          const latest = form.getValues(end);
          setValue(end, { ...latest, point, address: result.formattedAddress } as never);
        }
      } catch {
        // Keep the existing address; the pin is what matters for the geofence.
      }
    })();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const created1 = await createLoad.mutateAsync({
        values,
        plannedDistanceM: distanceState.kind === "ready" ? distanceState.metres : null,
      });
      setCreated(created1.load_code);
      // The list is the natural next stop, but the detail page is where the
      // dispatch decision happens, so go there.
      router.replace(`/(console)/loads/${created1.id}` as never);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? t("console.loads.saveFailed") : t("console.loads.saveFailed"),
      );
    }
  });

  const markers = [
    ...(pickupPoint === null
      ? []
      : [{ id: "pickup", position: pickupPoint, kind: "pickup" as const }]),
    ...(dropPoint === null ? [] : [{ id: "drop", position: dropPoint, kind: "drop" as const }]),
  ];

  const circles = [
    ...(pickupPoint === null
      ? []
      : [{ id: "pickup", center: pickupPoint, radiusM: pickup.radiusM }]),
    ...(dropPoint === null ? [] : [{ id: "drop", center: dropPoint, radiusM: drop.radiusM }]),
  ];

  const errorFor = (end: ActiveEnd): string | undefined => {
    const issue = form.formState.errors[end]?.point;
    return issue?.message === undefined ? undefined : t(issue.message as string);
  };

  return (
    <View style={styles.screen} testID="create-load-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>{t("console.loads.new.title")}</Text>
          <Text style={styles.subheading}>{t("console.loads.new.codeHint")}</Text>
        </View>
        <Button
          label={t("common.cancel")}
          onPress={() => router.back()}
          size="lg"
          variant="outline"
          testID="create-load-cancel"
        />
      </View>

      {created !== null ? (
        <Banner message={t("console.loads.new.created", { code: created })} variant="success" />
      ) : null}
      {submitError !== null ? (
        <Banner message={submitError} onDismiss={() => setSubmitError(null)} variant="error" />
      ) : null}

      <View style={styles.columns}>
        <ScrollView contentContainerStyle={styles.column} testID="create-load-form">
          <Card>
            <SectionHeader title={t("console.loads.new.pickup")} />
            <AddressPicker
              active={activeEnd === "pickup"}
              bias={dropPoint ?? undefined}
              errorText={errorFor("pickup")}
              label={t("console.loads.new.addressLabel")}
              onActivate={() => setActiveEnd("pickup")}
              onChange={(next) => setEndpoint("pickup", next)}
              testIDPrefix="create-load-pickup"
              value={toEndpointValue(pickup)}
            />
          </Card>

          <Card>
            <SectionHeader title={t("console.loads.new.drop")} />
            <AddressPicker
              active={activeEnd === "drop"}
              bias={pickupPoint ?? undefined}
              errorText={errorFor("drop")}
              label={t("console.loads.new.addressLabel")}
              onActivate={() => setActiveEnd("drop")}
              onChange={(next) => setEndpoint("drop", next)}
              testIDPrefix="create-load-drop"
              value={toEndpointValue(drop)}
            />
          </Card>

          <Card>
            <SectionHeader title={t("console.loads.new.details")} />
            <TextField
              label={t("console.loads.new.material")}
              onChangeText={(text) => setValue("material", text)}
              placeholder={t("console.loads.new.materialPlaceholder")}
              testID="create-load-material"
              value={material ?? ""}
            />
            <TextField
              keyboardType="decimal-pad"
              label={t("console.loads.new.weight")}
              onChangeText={(text) => setValue("weightTonnes", text)}
              testID="create-load-weight"
              value={weightTonnes ?? ""}
            />
            <TextField
              label={t("console.loads.new.notes")}
              multiline
              onChangeText={(text) => setValue("notes", text)}
              placeholder={t("console.loads.new.notesPlaceholder")}
              testID="create-load-notes"
              value={notes ?? ""}
            />
            {/*
              ND-19: the shipper select stays hidden until an admin can create a
              shipper profile at all, so `shipper_id` is left null. The column is
              nullable and the schema still accepts one.
            */}
          </Card>
        </ScrollView>

        <View style={styles.column}>
          <Card style={styles.mapCard}>
            <AppMap
              circles={circles}
              fitToContent
              markers={markers}
              onPress={(point) => onMapPress(point)}
            />
            <Text style={styles.mapHint}>
              {t("console.loads.new.mapHint", {
                which: t(`console.loads.new.${activeEnd}` as "console.loads.new.pickup"),
              })}
            </Text>
          </Card>

          <Card>
            <Text style={styles.strip} testID="create-load-distance">
              {distanceState.kind === "ready"
                ? t("console.loads.new.distanceReady", {
                    distance: [
                      formatKm(distanceState.metres),
                      formatDuration(distanceState.durationS),
                    ]
                      .filter((part) => part !== null)
                      .join(" · "),
                  })
                : distanceState.kind === "fetching"
                  ? t("console.loads.new.distanceFetching")
                  : t("console.loads.new.distancePending")}
            </Text>
            {distanceState.kind === "unavailable" ? (
              <Banner message={t("console.loads.new.distanceUnavailable")} variant="warning" />
            ) : null}
          </Card>

          <Button
            fullWidth
            label={t("console.loads.new.submit")}
            loading={createLoad.isPending}
            onPress={() => void onSubmit()}
            size="lg"
            testID="create-load-submit"
          />
        </View>
      </View>
    </View>
  );
}

/** The form's wider point type narrowed to the picker's shape. */
function toEndpointValue(value: {
  address: string;
  point?: LatLng;
  radiusM: number;
}): EndpointValue {
  return {
    address: value.address,
    point: value.point ?? null,
    radiusM: value.radiusM,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  subheading: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
  columns: { flex: 1, flexDirection: "row", gap: spacing.lg },
  column: { flex: 1, gap: spacing.md },
  mapCard: { flex: 1, minHeight: 320, padding: spacing.sm },
  mapHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  strip: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.subtitle,
    color: colors.text,
    textAlign: "center",
  },
});
