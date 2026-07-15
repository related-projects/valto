/**
 * i18n Configuration
 *
 * Initializes react-i18next with all supported languages.
 * Loads the persisted language preference from settings on init.
 * Fallback language: English.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import bn from './locales/bn.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import ur from './locales/ur.json';
import zh from './locales/zh.json';

const resources = {
    en: { translation: en },
    zh: { translation: zh },
    hi: { translation: hi },
    es: { translation: es },
    fr: { translation: fr },
    ar: { translation: ar },
    bn: { translation: bn },
    pt: { translation: pt },
    ru: { translation: ru },
    ur: { translation: ur },
};

i18n.use(initReactI18next).init({
    resources,
    lng: 'en', // Default — will be overridden by loadSettings() at app startup
    fallbackLng: 'en',
    interpolation: {
        escapeValue: false, // React already escapes
    },
    compatibilityJSON: 'v4',
});

export default i18n;
