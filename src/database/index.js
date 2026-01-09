/**
 * Database Module
 * 
 * Exports unified database interface that works with:
 * - PostgreSQL (when DATABASE_URL is set)
 * - JSON files (fallback for local development)
 */

const connection = require('./connection');
const repository = require('./repository');
const jsonStorage = require('./jsonStorage');

module.exports = {
  // Connection management
  initialize: connection.initialize,
  disconnect: connection.disconnect,
  healthCheck: connection.healthCheck,
  
  // Check what's available
  isPostgresAvailable: repository.isPostgresAvailable,
  
  // Main repository functions
  getFilters: repository.getFilters,
  addSegment: repository.addSegment,
  updateTitleMetadata: repository.updateTitleMetadata,
  voteSegment: repository.voteSegment,
  deleteSegment: repository.deleteSegment,
  verifySegment: repository.verifySegment,
  getStats: repository.getStats,
  listTitles: repository.listTitles,
  searchTitles: repository.searchTitles,
  bulkImportSegments: repository.bulkImportSegments,
  getOrCreateTitle: repository.getOrCreateTitle,
  
  // Legacy JSON functions (for backwards compatibility)
  saveFilters: jsonStorage.saveFilters,
  createEmptyFilterData: jsonStorage.createEmptyFilterData,
  listAllFilters: jsonStorage.listAllFilters,
  
  // Direct access if needed
  connection,
  repository,
  jsonStorage,
};
