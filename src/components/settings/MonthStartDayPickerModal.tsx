/**
 * Month Start Day Picker Modal
 *
 * The days 1 to 31 a month can start on (REGISTRE C20), as a scrollable list:
 * an Alert, the picker the first-day-of-week row used, cannot hold 31 items.
 * A check marks the current day. Picking closes the picker and hands the day
 * to the caller, which asks for confirmation before storing it.
 *
 * The list itself is OptionPickerModal (pass 101b item 1); this component
 * only supplies the days, their labels and their testIDs.
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OptionPickerModal, type PickerOption } from './OptionPickerModal';

interface MonthStartDayPickerModalProps {
    visible: boolean;
    onClose: () => void;
    onSelect: (day: number) => void;
    selectedDay: number;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export const MonthStartDayPickerModal: React.FC<MonthStartDayPickerModalProps> = ({
    visible,
    onClose,
    onSelect,
    selectedDay,
}) => {
    const { t } = useTranslation();

    const options = useMemo<PickerOption<number>[]>(() => DAYS.map((day) => ({
        value: day,
        label: String(day),
        testID: `month_start_day_option_${day}`,
        accessibilityLabel: t('settings.monthStartDayValue', { day }),
    })), [t]);

    return (
        <OptionPickerModal
            visible={visible}
            title={t('settings.monthStartDay')}
            options={options}
            selectedValue={selectedDay}
            onSelect={onSelect}
            onClose={onClose}
            closeLabel={t('a11y.closeButton')}
            closeTestID="month_start_day_picker_close"
        />
    );
};
