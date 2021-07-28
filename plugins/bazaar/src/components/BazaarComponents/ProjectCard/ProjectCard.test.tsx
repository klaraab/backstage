/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import React from 'react';
import { screen, cleanup } from '@testing-library/react';
import { ProjectCard } from './ProjectCard';
import { renderInTestApp } from '@backstage/test-utils';

afterEach(() => {
  cleanup();
});

it('should render ProjectCard without tags', async () => {
  const emptyTags = {
    title: 'Title',
    description: 'description',
    uid: '123',
    status: 'proposed',
    tags: [],
  };

  await renderInTestApp(<ProjectCard {...emptyTags} />);
  const cardElement = screen.getByTestId(`card-${emptyTags.uid}`);
  expect(cardElement).toBeInTheDocument();
  expect(cardElement).toHaveTextContent(emptyTags.title);
  expect(cardElement).toHaveTextContent(emptyTags.description);
  expect(cardElement).toHaveTextContent(emptyTags.status);
  const tags = screen.queryAllByTestId(id => id.startsWith('chip'));
  expect(tags).toHaveLength(0);
});

it("should not render 'bazaar'-tag ProjectCard", async () => {
  const emptyTags = {
    title: 'Title',
    description: 'description',
    uid: '123',
    status: 'proposed',
    tags: ['bazaar'],
  };
  await renderInTestApp(<ProjectCard {...emptyTags} />);
  const tags = screen.queryAllByTestId(id => id.startsWith('chip'));
  expect(tags).toHaveLength(0);
});

it('should render ProjectCard with tags', async () => {
  const emptyTags = {
    title: 'Title',
    description: 'description',
    uid: '123',
    status: 'proposed',
    tags: ['go', 'javascript'],
  };
  await renderInTestApp(<ProjectCard {...emptyTags} />);
  const tags = screen.queryAllByTestId(id => id.startsWith('chip'));
  expect(tags).toHaveLength(2);

  const cardElement = screen.getByTestId(`card-${emptyTags.uid}`);
  expect(cardElement).toHaveTextContent('go');
  expect(cardElement).toHaveTextContent('javascript');
});
