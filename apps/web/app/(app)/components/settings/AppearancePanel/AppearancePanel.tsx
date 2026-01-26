import { SettingsRow } from '../SettingsRow';
import { ThemeModeSelect } from './ThemeModeSelect';
import { FontSizeSelect } from './FontSizeSelect';
import { ThemeSelector } from '@/components/theme-selector';

export function AppearancePanel() {
    return (
        <div className="space-y-6">
            <SettingsRow label="Appearance mode" description="Follow system or force light/dark.">
                <ThemeModeSelect />
            </SettingsRow>

            <SettingsRow label="Color theme" description="Default / Blue / Green / Amber / …">
                <ThemeSelector compact />
            </SettingsRow>

            <SettingsRow label="Font size" description="Scale the overall UI text size.">
                <FontSizeSelect />
            </SettingsRow>
        </div>
    );
}
