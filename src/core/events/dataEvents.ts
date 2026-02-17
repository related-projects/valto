/**
 * Data Events System
 * 
 * Lightweight event-based system for cross-component data synchronization.
 * Allows hooks to emit and subscribe to data change events without coupling.
 */

type EventCallback = () => void;
type EventType = 'wallets' | 'transactions' | 'categories' | 'budgets';

class DataEventEmitter {
    private listeners: Map<EventType, Set<EventCallback>> = new Map();

    /**
     * Subscribe to data change events
     */
    subscribe(event: EventType, callback: EventCallback): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event)!.add(callback);

        // Return unsubscribe function
        return () => {
            this.listeners.get(event)?.delete(callback);
        };
    }

    /**
     * Emit a data change event to all subscribers
     */
    emit(event: EventType): void {
        this.listeners.get(event)?.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error(`Error in ${event} event handler:`, error);
            }
        });
    }

    /**
     * Emit multiple events at once (for operations affecting multiple data types)
     */
    emitMultiple(events: EventType[]): void {
        events.forEach(event => this.emit(event));
    }
}

// Singleton instance for app-wide data event coordination
export const dataEvents = new DataEventEmitter();
