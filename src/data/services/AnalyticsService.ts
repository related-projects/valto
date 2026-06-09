import PostHog from 'posthog-react-native';

class AnalyticsService {
    private posthog: PostHog | null = null;
    private isInitialized = false;

    init() {
        if (!this.isInitialized) {
            try {
                this.posthog = new PostHog('phc_placeholder_key', {
                    host: 'https://us.i.posthog.com',
                    captureAppLifecycleEvents: false, // Prevent noisy default events
                });
                this.isInitialized = true;
                this.trackAppOpen();
            } catch (e) {
                console.warn('Analytics initialization failed - safe to continue', e);
            }
        }
    }

    trackAppOpen() {
        if (this.isInitialized && this.posthog) {
            this.posthog.capture('App Opened');
        }
    }

    trackTransactionCreated(type: string) {
        if (this.isInitialized && this.posthog) {
            this.posthog.capture('Transaction Created', { type });
        }
    }

    trackWalletCreated(type: string) {
        if (this.isInitialized && this.posthog) {
            this.posthog.capture('Wallet Created', { type });
        }
    }

    trackSettingsUpdated(setting: string) {
        if (this.isInitialized && this.posthog) {
            this.posthog.capture('Settings Updated', { setting });
        }
    }
}

export const analyticsService = new AnalyticsService();
