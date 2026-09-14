import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Organization } from './Organization';

/** A named point of contact at a client organization. */
@Entity('organization_contacts')
export class OrganizationContact {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Organization, (organization) => organization.contacts, { onDelete: 'CASCADE' })
  organization!: Organization;

  @Column()
  name!: string;

  @Column({ nullable: true })
  title?: string;

  @Column({ nullable: true })
  email?: string;
}
