const request = require('supertest');
const app = require('../app');
const axios = require('axios');

jest.mock('axios');

describe('Energy Endpoints', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/energy/mix', () => {
        it('should return grouped energy mix data and calculate clean energy percentage', async () => {
            const mockData = {
                data: {
                    data: [
                        {
                            from: '2026-06-15T00:00Z',
                            to: '2026-06-15T00:30Z',
                            generationmix: [
                                { fuel: 'biomass', perc: 10 },
                                { fuel: 'coal', perc: 5 },
                                { fuel: 'wind', perc: 20 },
                                { fuel: 'solar', perc: 15 }
                            ]
                        },
                        {
                            from: '2026-06-16T00:00Z',
                            to: '2026-06-16T00:30Z',
                            generationmix: [
                                { fuel: 'biomass', perc: 10 },
                                { fuel: 'coal', perc: 5 },
                                { fuel: 'wind', perc: 30 },
                                { fuel: 'solar', perc: 5 }
                            ]
                        }
                    ]
                }
            };
            axios.get.mockResolvedValue(mockData);

            const res = await request(app).get('/api/energy/mix');
            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBeTruthy();
            
            const firstDay = res.body.find(d => d.date === '2026-06-15');
            expect(firstDay).toBeDefined();
            // biomass(10) + wind(20) + solar(15) = 45
            expect(firstDay.cleanEnergyPercentage).toBe(45);

            const secondDay = res.body.find(d => d.date === '2026-06-16');
            expect(secondDay).toBeDefined();
            // biomass(10) + wind(30) + solar(5) = 45
            expect(secondDay.cleanEnergyPercentage).toBe(45);
        });

        it('should return 500 if the external API fails', async () => {
            axios.get.mockRejectedValue(new Error('API Error'));
            const res = await request(app).get('/api/energy/mix');
            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error');
        });
    });

    describe('GET /api/energy/optimal-window', () => {
        it('should return 400 if hours parameter is missing or invalid', async () => {
            const res1 = await request(app).get('/api/energy/optimal-window');
            expect(res1.statusCode).toEqual(400);
            
            const res2 = await request(app).get('/api/energy/optimal-window?hours=10');
            expect(res2.statusCode).toEqual(400);

            const res3 = await request(app).get('/api/energy/optimal-window?hours=abc');
            expect(res3.statusCode).toEqual(400);
        });

        it('should return the optimal charging window', async () => {
            const mockData = {
                data: {
                    data: [
                        {
                            from: '2026-06-15T00:00Z',
                            to: '2026-06-15T00:30Z',
                            generationmix: [ { fuel: 'wind', perc: 10 } ]
                        },
                        {
                            from: '2026-06-15T00:30Z',
                            to: '2026-06-15T01:00Z',
                            generationmix: [ { fuel: 'wind', perc: 20 } ]
                        },
                        {
                            from: '2026-06-15T01:00Z',
                            to: '2026-06-15T01:30Z',
                            generationmix: [ { fuel: 'wind', perc: 90 } ]
                        },
                        {
                            from: '2026-06-15T01:30Z',
                            to: '2026-06-15T02:00Z',
                            generationmix: [ { fuel: 'wind', perc: 100 } ]
                        }
                    ]
                }
            };
            axios.get.mockResolvedValue(mockData);

            // 1 hour window requires 2 intervals of 30 minutes
            const res = await request(app).get('/api/energy/optimal-window?hours=1');
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('start', '2026-06-15T01:00Z');
            expect(res.body).toHaveProperty('end', '2026-06-15T02:00Z');
            expect(res.body).toHaveProperty('averageCleanEnergyPercentage', 95);
        });

        it('should return 500 if there is not enough data', async () => {
            const mockData = {
                data: {
                    data: [
                        {
                            from: '2026-06-15T00:00Z',
                            to: '2026-06-15T00:30Z',
                            generationmix: [ { fuel: 'wind', perc: 10 } ]
                        }
                    ]
                }
            };
            axios.get.mockResolvedValue(mockData);

            // Godzinne okno potrzebuje 2 interwałów, ale dostarczyliśmy 1
            const res = await request(app).get('/api/energy/optimal-window?hours=1');
            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('error');
        });
    });
});
