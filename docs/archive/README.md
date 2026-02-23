# Archived Documentation

This directory contains documentation that is no longer current but kept for reference.

## Why These Are Archived

### ARCHITECTURE.md (Archived)
- **Reason**: Described a "built-in" approach where features would be added to `src/vs/workbench/contrib/gamedev/`
- **Why Outdated**: We pivoted to using **VS Code Extensions** instead (faster, easier to maintain)
- **Replacement**: See [../MIGRATION_PLAN.md](../MIGRATION_PLAN.md) for current architecture (extensions-based)

### CUSTOMIZATION.md (Archived)
- **Reason**: Described custom theme and branding attempts
- **Why Outdated**: We're focusing on feature migration first, theming is secondary
- **Replacement**: Branding already applied in `product.json`, theme work deferred

## Current Documentation

Please refer to the active docs in `/docs`:
- **[MIGRATION_PLAN.md](../MIGRATION_PLAN.md)** - Current migration strategy
- **[README.md](../README.md)** - Project overview and quick start
- **[STRUCTURE.md](../STRUCTURE.md)** - Extension structure (being updated)
- **[DEVELOPMENT.md](../DEVELOPMENT.md)** - Development workflow (being updated)

---

**Last Updated**: February 22, 2026
