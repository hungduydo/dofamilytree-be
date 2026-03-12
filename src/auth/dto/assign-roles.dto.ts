import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignRolesDto {
  @ApiProperty({ example: ['member', 'editor'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  roles: string[];
}
