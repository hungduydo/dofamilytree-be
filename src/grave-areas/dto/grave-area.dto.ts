import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty, IsOptional, IsString, MaxLength, ValidationOptions, registerDecorator,
} from 'class-validator';
import { isValidPolygon, LatLng, MIN_POLYGON_VERTICES } from '../../graves/grave-location';

/** Polygon [[vĩ độ, kinh độ], ...], ít nhất 3 đỉnh. */
function IsPolygon(options?: ValidationOptions) {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isPolygon',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} phải là mảng ít nhất ${MIN_POLYGON_VERTICES} điểm [vĩ độ, kinh độ]`,
        ...options,
      },
      validator: { validate: (value: unknown) => isValidPolygon(value) },
    });
}

const POLYGON_SCHEMA = {
  type: 'array',
  items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
  minItems: MIN_POLYGON_VERTICES,
  example: [[16.7823, 107.1890], [16.7823, 107.1893], [16.7826, 107.1893], [16.7826, 107.1890]],
} as const;

export class CreateGraveAreaDto {
  @ApiProperty({ example: 'Đùng Vành' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ nullable: true, example: 'Khu mộ phía đông làng' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({
    ...POLYGON_SCHEMA,
    nullable: true,
    description: 'Ranh giới khu, [[vĩ độ, kinh độ], ...]. null = chưa vẽ.',
  })
  @IsOptional()
  @IsPolygon()
  polygon?: LatLng[] | null;
}

export class UpdateGraveAreaDto {
  @ApiPropertyOptional({ example: 'Đùng Vành' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ ...POLYGON_SCHEMA, nullable: true, description: 'null = xoá ranh giới' })
  @IsOptional()
  @IsPolygon()
  polygon?: LatLng[] | null;
}

export class GeoPointDto {
  @ApiProperty({ example: 16.78245 })
  latitude: number;

  @ApiProperty({ example: 107.18915 })
  longitude: number;
}

/** Mirrors the Prisma `GraveArea` model, plus the derived center and grave count. */
export class GraveAreaResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Đùng Vành' })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiPropertyOptional({ ...POLYGON_SCHEMA, nullable: true })
  polygon: LatLng[] | null;

  @ApiPropertyOptional({ type: () => GeoPointDto, nullable: true, description: 'Tâm polygon (null khi chưa vẽ)' })
  center: GeoPointDto | null;

  @ApiProperty({ example: 27, description: 'Số mộ thuộc khu' })
  graveCount: number;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;
}
