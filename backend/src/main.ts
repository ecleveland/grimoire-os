import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import {
  configureBodyParsers,
  configureTrustProxy,
  GLOBAL_VALIDATION_PIPE_OPTIONS,
} from './bootstrap-config';
import { cookieModeDescription } from './config/cookie.config';
import { trustProxyDescription } from './config/trust-proxy.config';

async function bootstrap() {
  // Nest's default body parser is disabled so configureBodyParsers can install
  // route-scoped JSON limits (100KB on auth endpoints, 1MB everywhere else).
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  const configService = app.get(ConfigService);
  // Logged before listen so the lines are in the log by the time a healthcheck passes.
  const logger = new Logger('Bootstrap');
  logger.log(cookieModeDescription());
  configureTrustProxy(app, configService.get<number>('trustProxy') ?? 0);
  logger.log(trustProxyDescription());

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  configureBodyParsers(app);

  app.useGlobalPipes(new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS));

  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: {
        maxAge: 15552000,
        includeSubDomains: true,
      },
    })
  );

  app.enableCors({
    origin: configService.get<string>('cors.origin'),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GrimoireOS API')
    .setDescription('REST API for D&D 5e campaign management')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('port') ?? 3001;
  await app.listen(port);
}
void bootstrap();
