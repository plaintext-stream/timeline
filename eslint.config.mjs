import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{ ignores: ['node_modules', 'worker-configuration.d.ts', 'public/vendor'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		files: ['src/**/*.ts', 'test/**/*.ts'],
		languageOptions: {
			globals: { FetchEvent: 'readonly' },
		},
	},
);
