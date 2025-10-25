# Contributing to Noodle Perplexity MCP

Thank you for your interest in contributing to Noodle Perplexity MCP! This document provides guidelines for contributing to this project.

## About This Project

This project is a derivative work based on the original [Perplexity MCP Server](https://github.com/cyanheads/perplexity-mcp-server) by Casey Hand (@cyanheads). It is currently maintained by Fahd Rafi (@fahd-noodleseed).

## License

This project is licensed under the Apache License 2.0. By contributing to this project, you agree that your contributions will be licensed under the same license. See the [LICENSE](LICENSE) file for details.

### Important License Requirements

When contributing, please note:

1. **Attribution**: You must retain all existing copyright notices and attribution in the code
2. **Modified Files**: Mark any files you modify with a notice stating that you changed them
3. **License Compliance**: All contributions must comply with Apache License 2.0 terms

## How to Contribute

### Reporting Issues

- Use the [GitHub Issues](https://github.com/fahd-noodleseed/perplexity-mcp-server/issues) page
- Search existing issues before creating a new one
- Provide clear descriptions, steps to reproduce, and expected vs actual behavior
- Include relevant logs, error messages, and environment details

### Submitting Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Follow the existing code style** and architecture patterns (see [CLAUDE.md](CLAUDE.md))
3. **Add tests** if applicable (we're working on expanding test coverage)
4. **Update documentation** including README.md, CLAUDE.md, or JSDoc comments as needed
5. **Follow the commit message convention**:
   - Use clear, descriptive commit messages
   - Format: `type: description` (e.g., `feat: add new search filter`, `fix: handle null dates`)
   - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
6. **Ensure your code builds**: Run `npm run rebuild` before submitting
7. **Add yourself to contributors** if making a significant contribution

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/perplexity-mcp-server.git
cd perplexity-mcp-server

# Install dependencies
npm install

# Create .env file with your Perplexity API key
echo "PERPLEXITY_API_KEY=your_key_here" > .env

# Build the project
npm run build

# Start the server
npm start
```

### Code Style and Architecture

This project follows specific architectural patterns. Please review:

- **[CLAUDE.md](CLAUDE.md)**: Comprehensive development guide with patterns and conventions
- **"Logic Throws, Handler Catches" principle**: All tool logic must throw errors, handlers catch them
- **File structure**: Each tool has `index.ts`, `logic.ts`, and `registration.ts`
- **Error handling**: Use `McpError` types and `ErrorHandler` utility
- **Logging**: Use structured logging with `RequestContext`
- **Validation**: Use Zod schemas for all inputs/outputs

### Adding New Features

When adding new features:

1. **Discuss first**: Open an issue to discuss major changes before implementing
2. **Follow existing patterns**: Study existing tools (e.g., `perplexityAsk`, `perplexityThinkAndAnalyze`)
3. **Update documentation**: Add JSDoc comments, update CLAUDE.md and README.md
4. **Consider backwards compatibility**: Avoid breaking existing functionality

### Adding New Tools

To add a new MCP tool:

1. Create directory: `src/mcp-server/tools/yourToolName/`
2. Create `logic.ts` with Zod schemas and business logic
3. Create `registration.ts` with MCP registration and error handling
4. Create `index.ts` exporting the registration function
5. Import and register in `src/mcp-server/server.ts`
6. Update documentation

See [CLAUDE.md](CLAUDE.md) for detailed tool development guidance.

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment, discriminatory language, or personal attacks
- Trolling, insulting/derogatory comments
- Publishing others' private information
- Other conduct which could reasonably be considered inappropriate

## Questions?

- Open an issue for project-related questions
- Check existing documentation in [README.md](README.md) and [CLAUDE.md](CLAUDE.md)
- Review closed issues for previously answered questions

## Recognition

Contributors will be recognized in:
- The `contributors` field in [package.json](package.json)
- Release notes for significant contributions
- The project's acknowledgment section

Thank you for contributing to Noodle Perplexity MCP!
