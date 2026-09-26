import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { Modal } from '@/components/console/Overlay';
import { Banner, Button, ChoiceChips, TextField } from '@/components/ui';
import { DuplicateVehicleError, useAddVehicle } from '@/features/console/queries';
import { pick, t } from '@/i18n';

import { parseRegistration } from './registration';
import { addVehicleSchema, VEHICLE_TYPES, type AddVehicleInput, type AddVehicleValues } from './schemas';

const copy = t.console.vehicles.form;
const msg = (key: string | undefined) => (key ? pick(copy.errors, key, copy.errors.unknown) : undefined);

export function AddVehicleModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (v: AddVehicleValues) => void;
}) {
  const add = useAddVehicle();
  const { control, handleSubmit, reset, setError, formState } = useForm<
    AddVehicleInput,
    unknown,
    AddVehicleValues
  >({
    resolver: zodResolver(addVehicleSchema),
    defaultValues: { registrationNo: '', vehicleType: undefined },
  });
  const reg = useWatch({ control, name: 'registrationNo' });
  const preview = parseRegistration(reg ?? '');

  function close() {
    reset();
    add.reset();
    onClose();
  }

  const submit = handleSubmit(async (values) => {
    try {
      await add.mutateAsync(values);
      onAdded(values);
      close();
    } catch (e) {
      if (e instanceof DuplicateVehicleError) setError('registrationNo', { message: 'duplicate' });
    }
  });

  const serverError =
    add.error && !(add.error instanceof DuplicateVehicleError) ? copy.errors.unknown : undefined;

  return (
    <Modal
      open={open}
      title={t.console.vehicles.add}
      onClose={close}
      footer={
        <>
          <View style={{ minWidth: 120 }}>
            <Button label={t.console.cancel} variant="text" onPress={close} />
          </View>
          <View style={{ minWidth: 160 }}>
            <Button
              label={copy.submit}
              icon="save"
              loading={formState.isSubmitting}
              onPress={submit}
              testID="add-vehicle-submit"
            />
          </View>
        </>
      }
    >
      <Controller
        control={control}
        name="registrationNo"
        render={({ field, fieldState }) => (
          <TextField
            testID="vehicle-reg"
            label={copy.reg}
            value={field.value}
            onChangeText={(v) => field.onChange(v.toUpperCase())}
            onBlur={field.onBlur}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={copy.regPlaceholder}
            error={msg(fieldState.error?.message)}
            hint={preview.ok ? copy.regPreview(preview.formatted) : copy.regHint}
          />
        )}
      />
      <Controller
        control={control}
        name="vehicleType"
        render={({ field, fieldState }) => (
          <ChoiceChips
            label={copy.type}
            options={VEHICLE_TYPES}
            value={field.value}
            onChange={field.onChange}
            error={msg(fieldState.error?.message)}
          />
        )}
      />
      {serverError ? <Banner tone="error" message={serverError} /> : null}
    </Modal>
  );
}
