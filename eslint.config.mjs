import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
	{
		ignores: ['node_modules', 'worker-configuration.d.ts', 'public/vendor', '.wrangler', '.mf'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		files: ['src/**/*.ts', 'test/**/*.ts'],
		languageOptions: {
			globals: { FetchEvent: 'readonly' },
		},
	},
	{
		files: ['public/**/*.js'],
		languageOptions: {
			globals: {
				...globals.browser,
				marked: 'readonly',
				DOMPurify: 'readonly',
			},
		},
	},
);
