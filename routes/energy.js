const express = require('express');
const router = express.Router();
const axios = require('axios');

const CLEAN_ENERGY_SOURCES = ['biomass', 'nuclear', 'hydro', 'wind', 'solar'];

router.get('/mix', async (req, res) => {
    try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        
        const threeDaysLater = new Date(today);
        threeDaysLater.setUTCDate(today.getUTCDate() + 3);

        const fromIso = today.toISOString();
        const toIso = threeDaysLater.toISOString();

        const response = await axios.get(`https://api.carbonintensity.org.uk/generation/${fromIso}/${toIso}`);
        const data = response.data.data;

        // Group intervals by date
        const groupedByDate = {};

        data.forEach(interval => {
            // Grupujemy po dacie
            console.log(interval)
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

module.exports = router;
