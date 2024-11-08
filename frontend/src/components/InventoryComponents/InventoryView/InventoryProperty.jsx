import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

const InventoryProperty = ({ label, value, icon: Icon }) => {
  const formattedValue =
    value && typeof value === 'string'
      ? value.replace(/\n/g, '<br />')
      : String(value);
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-sm 2xl:text-base font-semibold h-7">{label}</h2>
      <p className="text-sm 2xl:text-base flex items-center gap-2 justify-start min-h-6 border-b border-neutral-100 pb-1">
        {Icon && <Icon size={20} className="inline text-purple-500" />}
        <span dangerouslySetInnerHTML={{ __html: formattedValue }} />
      </p>
    </div>
  );
};

InventoryProperty.Skeleton = function InventoryPropertySkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="h-6 rounded-md w-1/3" />
      <Skeleton className="h-5 rounded-md w-full" />
    </div>
  );
};
export default InventoryProperty;
