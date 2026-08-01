import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CreateDeceasedDto, UpdateDeceasedDto } from './dto/deceased.dto';
import { DeceasedService } from './deceased.service';

@Controller('deceased')
export class DeceasedController {
  constructor(private readonly deceasedService: DeceasedService) {}

  @Get()
  findAll() {
    return this.deceasedService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.deceasedService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDeceasedDto) {
    return this.deceasedService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeceasedDto) {
    return this.deceasedService.update(id, dto);
  }
}
