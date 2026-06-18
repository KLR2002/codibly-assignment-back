const express = require('express');
const router = express.Router();
const axios = require('axios');

const CLEAN_ENERGY_SOURCES = ['biomass', 'nuclear', 'hydro', 'wind', 'solar'];

router.get('/mix', async (req, res) => {
    try {
        const today = new Date();
        today.setUTCHours(0, 1, 0, 0);
        
        const threeDaysLater = new Date(today);
        threeDaysLater.setUTCDate(today.getUTCDate() + 3);

        const fromIso = today.toISOString();
        const toIso = threeDaysLater.toISOString();

        const response = await axios.get(`https://api.carbonintensity.org.uk/generation/${fromIso}/${toIso}`);
        const data = response.data.data;

        const groupedByDate = {};

        data.forEach(interval => {
            // Grupujemy po dacie
            const dateStr = interval.from.split('T')[0];
            if (!groupedByDate[dateStr]) {
                groupedByDate[dateStr] = {
                    count: 0,
                    fuels: {}
                };
            }
            groupedByDate[dateStr].count += 1;
            
            interval.generationmix.forEach(mix => {
                if (!groupedByDate[dateStr].fuels[mix.fuel]) {
                    groupedByDate[dateStr].fuels[mix.fuel] = 0;
                }
                groupedByDate[dateStr].fuels[mix.fuel] += mix.perc;
            });
        });

        // obliczamy udział w mixie
        const result = Object.keys(groupedByDate).map(dateStr => {
            const dayData = groupedByDate[dateStr];
            const generationmix = [];
            let cleanEnergyPercentage = 0;

            for (const [fuel, totalPerc] of Object.entries(dayData.fuels)) {
                const avgPerc = Number((totalPerc / dayData.count).toFixed(2));
                generationmix.push({
                    fuel,
                    perc: avgPerc
                });

                if (CLEAN_ENERGY_SOURCES.includes(fuel)) {
                    cleanEnergyPercentage += avgPerc;
                }
            }

            return {
                date: dateStr,
                generationmix,
                cleanEnergyPercentage: Number(cleanEnergyPercentage.toFixed(2))
            };
        });

        // Tylko trzy dni
        const sortedResult = result.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);

        res.json(sortedResult);

    } catch (error) {
        console.error('Error fetching energy mix:', error.message);
        res.status(500).json({ error: 'Failed to fetch energy mix data' });
    }
});

router.get('/optimal-window', async (req, res) => {
    try {
        const hours = parseInt(req.query.hours, 10);
        if (isNaN(hours) || hours < 1 || hours > 6) {
            return res.status(400).json({ error: 'Parameter "hours" must be an integer between 1 and 6' });
        }

        const intervalsNeeded = hours * 2;

        // Dane z następnych 48h
        const now = new Date();
        const fromIso = now.toISOString();
        const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const toIso = twoDaysLater.toISOString();

        const response = await axios.get(`https://api.carbonintensity.org.uk/generation/${fromIso}/${toIso}`);
        const data = response.data.data;

        if (!data || data.length < intervalsNeeded) {
            return res.status(500).json({ error: 'Not enough data from API to find a window of this length' });
        }

        let bestWindow = null;
        let maxCleanEnergy = -1;

        // Obliczamy udział czystej energii dla każdego interwału
        const intervals = data.map(interval => {
            let cleanPerc = 0;
            interval.generationmix.forEach(mix => {
                if (CLEAN_ENERGY_SOURCES.includes(mix.fuel)) {
                    cleanPerc += mix.perc;
                }
            });
            return {
                from: interval.from,
                to: interval.to,
                cleanPerc
            };
        });

        // Wyznaczanie optymalnego okna
        for (let i = 0; i <= intervals.length - intervalsNeeded; i++) {
            let sumClean = 0;
            for (let j = 0; j < intervalsNeeded; j++) {
                sumClean += intervals[i + j].cleanPerc;
            }
            const avgClean = sumClean / intervalsNeeded;

            if (avgClean > maxCleanEnergy) {
                maxCleanEnergy = avgClean;
                bestWindow = {
                    start: intervals[i].from,
                    end: intervals[i + intervalsNeeded - 1].to,
                    averageCleanEnergyPercentage: Number(avgClean.toFixed(2))
                };
            }
        }

        res.json(bestWindow);

    } catch (error) {
        console.error('Error calculating optimal window:', error.message);
        res.status(500).json({ error: 'Failed to calculate optimal window' });
    }
});

module.exports = router;
