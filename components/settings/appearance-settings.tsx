"use client";

import { useTranslations } from 'next-intl';
import { useSettingsStore } from '@/stores/settings-store';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { SettingsSection, SettingItem, RadioGroup, ToggleSwitch } from './settings-section';

export function AppearanceSettings() {
  const t = useTranslations('settings.appearance');
  const { fontSize, listDensity, animationsEnabled, updateSetting } = useSettingsStore();

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {/* No theme setting: the application is light, and so is the
          letter it writes. Offering dark here would promise something the
          rest of the product does not keep. */}
      {/* Language */}
      <SettingItem label={t('language.label')} description={t('language.description')}>
        <LanguageSwitcher />
      </SettingItem>

      {/* Font Size */}
      <SettingItem label={t('font_size.label')} description={t('font_size.description')}>
        <RadioGroup
          value={fontSize}
          onChange={(value) => updateSetting('fontSize', value as 'small' | 'medium' | 'large')}
          options={[
            { value: 'small', label: t('font_size.small') },
            { value: 'medium', label: t('font_size.medium') },
            { value: 'large', label: t('font_size.large') },
          ]}
        />
      </SettingItem>

      {/* List Density */}
      <SettingItem label={t('list_density.label')} description={t('list_density.description')}>
        <RadioGroup
          value={listDensity}
          onChange={(value) =>
            updateSetting('listDensity', value as 'extra-compact' | 'compact' | 'regular' | 'comfortable')
          }
          options={[
            { value: 'extra-compact', label: t('list_density.extra_compact') },
            { value: 'compact', label: t('list_density.compact') },
            { value: 'regular', label: t('list_density.regular') },
            { value: 'comfortable', label: t('list_density.comfortable') },
          ]}
        />
      </SettingItem>

      {/* Animations */}
      <SettingItem label={t('animations.label')} description={t('animations.description')}>
        <ToggleSwitch
          checked={animationsEnabled}
          onChange={(checked) => updateSetting('animationsEnabled', checked)}
        />
      </SettingItem>
    </SettingsSection>
  );
}
