import { Skill } from '../../src/types/index.js';

const weatherSkill: Skill = {
  name: 'weather',
  description: 'Provides weather-related responses (demo skill)',
  version: '1.0.0',
  author: 'AI CLI',
  triggers: ['weather', 'forecast', 'temperature', 'rain', 'sunny'],

  async onTrigger(context) {
    const { args, input } = context;
    const city = args[0] || 'your city';

    if (input.includes('rain')) {
      return `🌧️  Weather Skill: It might rain in ${city} today. Don't forget your umbrella! ☔`;
    }
    if (input.includes('sunny') || input.includes('hot')) {
      return `☀️  Weather Skill: It's sunny in ${city}! Great day to go outside. 🌻`;
    }
    if (input.includes('cold') || input.includes('snow')) {
      return `❄️  Weather Skill: It's cold in ${city}. Stay warm! 🧣`;
    }

    return `🌤️  Weather Skill: The weather in ${city} looks pleasant today with a mix of clouds and sunshine. Temperature around 22°C (72°F).`;
  },
};

export default weatherSkill;
