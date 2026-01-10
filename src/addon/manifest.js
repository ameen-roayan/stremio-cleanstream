/**
 * CleanStream - Stremio Addon
 * Family-friendly viewing with smart scene skipping
 */

const { addonBuilder } = require('stremio-addon-sdk');

// Addon Manifest
const manifest = {
  id: 'community.cleanstream',
  version: '1.0.0',
  name: 'CleanStream',
  description: 'Family-friendly viewing - skip nudity, violence, and other unwanted content in movies and TV shows. Community-driven, free forever.',
  logo: 'https://raw.githubusercontent.com/cleanstream/cleanstream-stremio/main/assets/logo.png',
  background: 'https://raw.githubusercontent.com/cleanstream/cleanstream-stremio/main/assets/background.jpg',
  
  // Resources we provide
  resources: ['catalog', 'subtitles'],
  
  // Content types we support
  types: ['movie', 'series'],
  
  // We work with IMDB IDs
  idPrefixes: ['tt'],
  
  // Configurable user settings
  behaviorHints: {
    configurable: true,
    configurationRequired: false,
  },
  
  // User-configurable filter categories
  config: [
    {
      key: 'nudity',
      type: 'select',
      title: 'Nudity Filter',
      options: ['off', 'low', 'medium', 'high'],
      default: 'high',
    },
    {
      key: 'sex',
      type: 'select', 
      title: 'Sexual Content Filter',
      options: ['off', 'low', 'medium', 'high'],
      default: 'high',
    },
    {
      key: 'violence',
      type: 'select',
      title: 'Violence Filter',
      options: ['off', 'low', 'medium', 'high'],
      default: 'medium',
    },
    {
      key: 'language',
      type: 'select',
      title: 'Language/Profanity Filter',
      options: ['off', 'low', 'medium', 'high'],
      default: 'off',
    },
    {
      key: 'drugs',
      type: 'select',
      title: 'Drugs/Alcohol Filter',
      options: ['off', 'low', 'medium', 'high'],
      default: 'off',
    },
    {
      key: 'fear',
      type: 'select',
      title: 'Frightening Scenes Filter',
      options: ['off', 'low', 'medium', 'high'],
      default: 'off',
    },
  ],
  
  catalogs: [
    {
      type: 'movie',
      id: 'cleanstream-movies',
      name: 'CleanStream Ready',
      extra: [
        { name: 'skip', isRequired: false },
        { name: 'search', isRequired: false },
      ],
    },
  ],
};

// Create the addon builder
const builder = new addonBuilder(manifest);

module.exports = { builder, manifest };
