
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, vi } from 'vitest';
import Analytics from '../app';
import ModelQualityPage from '../pages/ModelQualityPage';
import { api } from '../api';

vi.mock('../api', async () => {
    const actual = await vi.importActual('../api');
    return {
        ...actual,
        api: {
            ...actual.api,
            login: vi.fn(),
            kpi: vi.fn(),
            kpiDrilldown: vi.fn(),
        },
    };
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('KPI Dashboard Integration', () => {
    it('renders login screen when no token is present', async () => {
        api.kpi.mockResolvedValueOnce({
            modelQuality: 95,
            clusterQuality: 100,
            aiDetection: 0
        });

        render(
            <BrowserRouter>
                <Analytics />
            </BrowserRouter>
        );

        expect(await screen.findByText('Login')).toBeInTheDocument();
        expect(await screen.findByLabelText('Dominio cliente')).toBeInTheDocument();
    });

    it('navigates to drilldown on click', async () => {
        // Setup render and mock
        // Click Event
        // Expect navigation (checking changed URL or component mount)
    });
});

describe('Model Quality Page', () => {
    it('renders loading state', async () => {
        api.kpi.mockResolvedValueOnce({ modelQuality: 80 });
        api.kpiDrilldown.mockResolvedValueOnce({
            groupsIssues: [],
            staleAccounts: [{ username: 'stale_user' }],
            zeroGroupsUsers: [],
            overprivilegedUsers: []
        });

        render(<ModelQualityPage />);

        expect(screen.getByText('Caricamento dati Model Score...')).toBeInTheDocument();
    });
});
