import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { BaseSoftDeleteEntity } from './base-soft-delete.entity';

@Entity('operations_library_books')
@Index(['isbn'])
@Index(['title'])
export class LibraryBook extends BaseSoftDeleteEntity {
  @PrimaryGeneratedColumn()
  book_id: number;

  @Column({ length: 20, nullable: true })
  isbn: string;

  @Column({ length: 300 })
  title: string;

  @Column({ length: 200, nullable: true })
  author: string;

  @Column({ length: 120, nullable: true })
  publisher: string;

  @Column({ type: 'int', default: 1 })
  total_copies: number;

  @Column({ type: 'int', default: 1 })
  available_copies: number;

  @Column({ length: 60, nullable: true })
  shelf_location: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
