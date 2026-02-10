
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Analytics from '../app';
import ModelQualityPage from '../pages/ModelQualityPage';
import { api } from '../api';

// Mock API
jest.mock('../api');

describe('KPI Dashboard Integration', () => {
    it('renders KPI cards correctly', async () => {
        api.kpi.mockResolvedValue({
            modelQuality: 95,
            clusterQuality: 100,
            aiDetection: 0
        });

        render(
            <BrowserRouter>
                <Analytics />
            </BrowserRouter>
        );

        expect(await screen.findByText('Model Quality')).toBeInTheDocument();
        expect(await screen.findByText('95%')).toBeInTheDocument();
        expect(await screen.findByText('Cluster Quality')).toBeInTheDocument();
    });

    it('navigates to drilldown on click', async () => {
        // Setup render and mock
        // Click Event
        // Expect navigation (checking changed URL or component mount)
    });
});

describe('Model Quality Page', () => {
    it('displays tabs and default data', async () => {
        api.kpi.mockResolvedValue({ modelQuality: 80 });
        api.kpiDrilldown.mockResolvedValue({
            groupsIssues: [],
            staleAccounts: [{ username: 'stale_user' }],
            zeroGroupsUsers: [],
            overprivilegedUsers: []
        });

        render(<ModelQualityPage />);

        expect(await screen.findByText('Model Quality Score')).toBeInTheDocument();
        expect(await screen.findByText('Stale Accounts')).toBeInTheDocument();
        expect(await screen.findByText('stale_user')).toBeInTheDocument();
    });
});
