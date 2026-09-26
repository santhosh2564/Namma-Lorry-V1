import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { Drawer } from '@/components/console/Overlay';
import { Banner, Button, ChoiceChips, Text, TextField } from '@/components/ui';
import { useCreateDriver } from '@/features/console/queries';
import { t } from '@/i18n/en';
import { FunctionError } from '@/lib/functions';

import { addDriverSchema, LANGUAGES, type AddDriverInput, type AddDriverValues } from './schemas';

const copy = t.console.drivers.form;
const msg = (key: string | undefined) => (key ? (copy.errors[key] ?? copy.errors.unknown) : undefined);

export function AddDriverDrawer({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (v: AddDriverValues) => void;
}) {
  const create = useCreateDriver();
  const { control, handleSubmit, reset, setError, formState } = useForm<
    AddDriverInput,
    unknown,
    AddDriverValues
  >({
    resolver: zodResolver(addDriverSchema),
    defaultValues: { fullName: '', phone: '', preferredLanguage: 'ta' },
  });

  function close() {
    reset();
    create.reset();
    onClose();
  }

  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values);
      onAdded(values);
      close();
    } catch (e) {
      if (e instanceof FunctionError && e.code === 'PHONE_EXISTS') {
        setError('phone', { message: 'PHONE_EXISTS' });
      }
    }
  });

  const serverError =
    create.error && !(create.error instanceof FunctionError && create.error.code === 'PHONE_EXISTS')
      ? msg(create.error instanceof FunctionError ? create.error.code : 'unknown')
      : undefined;

  return (
    <Drawer
      open={open}
      title={t.console.drivers.add}
      onClose={close}
      footer={
        <>
          <View style={{ minWidth: 120 }}>
            <Button label={t.console.cancel} variant="text" onPress={close} />
          </View>
          <View style={{ minWidth: 160 }}>
            <Button
              label={copy.submit}
              icon="person-add"
              loading={formState.isSubmitting}
              onPress={submit}
              testID="add-driver-submit"
            />
          </View>
        </>
      }
    >
      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <TextField
            testID="driver-name"
            label={copy.name}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="words"
            placeholder="Murugan S"
            error={msg(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            testID="driver-phone"
            label={copy.phone}
            prefix="+91"
            value={field.value}
            onChangeText={(v) => field.onChange(v.replace(/[^\d ]/g, ''))}
            onBlur={field.onBlur}
            keyboardType="phone-pad"
            inputMode="tel"
            maxLength={12}
            placeholder="98xxx xxxxx"
            error={msg(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="preferredLanguage"
        render={({ field }) => (
          <ChoiceChips
            label={copy.language}
            options={LANGUAGES}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      <Text variant="caption" tone="secondary">
        {copy.note}
      </Text>
      {serverError ? <Banner tone="error" message={serverError} testID="add-driver-error" /> : null}
    </Drawer>
  );
}
