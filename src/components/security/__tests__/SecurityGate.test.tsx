/**
 * SecurityGate Tests (Part B — true gate)
 *
 * Proves the authenticated subtree does NOT mount while locked, so the
 * financial repositories are never queried until the session is unlocked.
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { useSecurity } from '../../../core/security/SecurityContext';
import { SecurityGate } from '../SecurityGate';

// Mock the security context hook so we can drive lock state directly.
jest.mock('../../../core/security/SecurityContext', () => ({
    useSecurity: jest.fn(),
}));

const mockedUseSecurity = useSecurity as unknown as jest.Mock;

// A stand-in for a data-consuming screen: on mount it reads from a repository,
// exactly like useWallets/useTransactions do.
const repository = { getAll: jest.fn() };
function FinancialScreen() {
    React.useEffect(() => {
        repository.getAll();
    }, []);
    return <Text>financial</Text>;
}

function LockScreen() {
    return <Text>locked</Text>;
}

function renderGate() {
    return render(
        <SecurityGate lockScreen={<LockScreen />}>
            <FinancialScreen />
        </SecurityGate>,
    );
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('SecurityGate', () => {
    it('DoD#6: while LOCKED the financial subtree never mounts and the repo is not queried', () => {
        mockedUseSecurity.mockReturnValue({
            isUnlocked: false,
            isSecurityEnabled: true,
            loading: false,
        });

        const { queryByText, getByText } = renderGate();

        expect(repository.getAll).not.toHaveBeenCalled();
        expect(queryByText('financial')).toBeNull();
        expect(getByText('locked')).toBeTruthy();
    });

    it('does not mount the subtree while still loading', () => {
        mockedUseSecurity.mockReturnValue({
            isUnlocked: true, // default-unlocked during load must NOT leak data
            isSecurityEnabled: true,
            loading: true,
        });

        const { queryByText } = renderGate();
        expect(repository.getAll).not.toHaveBeenCalled();
        expect(queryByText('financial')).toBeNull();
    });

    it('mounts the subtree and reaches the repo once UNLOCKED', () => {
        mockedUseSecurity.mockReturnValue({
            isUnlocked: true,
            isSecurityEnabled: true,
            loading: false,
        });

        const { getByText, queryByText } = renderGate();

        expect(repository.getAll).toHaveBeenCalledTimes(1);
        expect(getByText('financial')).toBeTruthy();
        expect(queryByText('locked')).toBeNull();
    });

    it('mounts the subtree when security is not enabled at all', () => {
        mockedUseSecurity.mockReturnValue({
            isUnlocked: false,
            isSecurityEnabled: false,
            loading: false,
        });

        renderGate();
        expect(repository.getAll).toHaveBeenCalledTimes(1);
    });
});
