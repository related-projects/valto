/**
 * SecurityGate Component
 *
 * A TRUE gate (not an overlay): it renders the authenticated app subtree XOR
 * the lock screen — never both. While locked, `children` are not rendered, so
 * the data-consuming screens never mount and their hooks (useWallets,
 * useTransactions, …) never read financial data into memory. Data is guarded
 * at its source, not merely hidden behind an overlay.
 *
 * App bootstrap (DB init, migrations) runs OUTSIDE this gate and is unaffected.
 */

import React from 'react';
import { useSecurity } from '../../core/security/SecurityContext';
import { AuthGate } from './AuthGate';

interface SecurityGateProps {
    /** The authenticated subtree — mounted only when unlocked. */
    children: React.ReactNode;
    /** Lock screen to show while locked (defaults to <AuthGate />). */
    lockScreen?: React.ReactNode;
}

export const SecurityGate: React.FC<SecurityGateProps> = ({
    children,
    lockScreen = <AuthGate />,
}) => {
    const { isUnlocked, isSecurityEnabled, loading } = useSecurity();

    // While the security config is still loading we know neither whether a PIN
    // exists nor whether the session is unlocked — hold the subtree back so we
    // never momentarily mount data hooks before a required unlock.
    if (loading) {
        return null;
    }

    if (isSecurityEnabled && !isUnlocked) {
        return <>{lockScreen}</>;
    }

    return <>{children}</>;
};
