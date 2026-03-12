import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('System')
@Controller()
export class AppController {
  @Get('status')
  @ApiOperation({ summary: 'Check API status' })
  getStatus() {
    return {
      status: 'ok',
      name: 'Family Tree API v2',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Get()
  @ApiOperation({ summary: 'API Root' })
  getRoot() {
    return {
      message: 'Family Tree API v2 is running',
      docs: '/docs',
      status: '/v2/status',
    };
  }
}
