import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'myuni-api',
      version: '0.1.0',
      description:
        'Open-source REST API for Malaysian university and campus data (public & private institutions).',
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [{ url: '/api', description: 'API base path' }],
  },
  apis: ['./src/routes/*.ts', './dist/routes/*.js'],
});
